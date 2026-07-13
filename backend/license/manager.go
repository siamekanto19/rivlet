package license

import (
	"context"
	"errors"
	"strings"
	"sync"
	"time"
)

// nowISO is the license package's timestamp helper (RFC3339, UTC).
func nowISO() string { return time.Now().UTC().Format(time.RFC3339) }

// Status is the license snapshot the UI renders and the app reports. It combines
// the resolved Policy with human-facing context about the certificate.
type Status struct {
	Tier        string `json:"tier"`
	Health      Health `json:"health"`
	Licensed    bool   `json:"licensed"` // a certificate is bound to this device (regardless of health)
	LicenseID   string `json:"licenseId,omitempty"`
	Product     string `json:"product,omitempty"`
	Edition     string `json:"edition,omitempty"`
	VersionScope string `json:"versionScope,omitempty"`
	DeviceID    string `json:"deviceId"`
	DeviceName  string `json:"deviceName"`
	DeviceLimit int    `json:"deviceLimit,omitempty"`
	IssuedAt    string `json:"issuedAt,omitempty"`
	RefreshBy   string `json:"refreshBy,omitempty"`
	Policy      Policy `json:"policy"`
	Message     string `json:"message,omitempty"`
}

// Manager owns the desktop entitlement state: the persisted certificate, its
// verification and evaluation, and the calls to the licensing backend. It is the
// single object the Wails layer and the download engine consult.
type Manager struct {
	store  *store
	client *Client
	keys   KeySet

	mu      sync.RWMutex
	current Status // cached evaluation, refreshed whenever the certificate changes
}

// NewManager loads the license state from statePath, evaluates any stored
// certificate, and returns a ready Manager. It never fails on a missing or
// invalid certificate — those simply resolve to Free.
func NewManager(statePath string) (*Manager, error) {
	st, err := openStore(statePath)
	if err != nil {
		return nil, err
	}
	m := &Manager{store: st, client: NewClient(), keys: TrustedKeys()}
	m.reevaluate()
	return m, nil
}

// Policy returns the current effective policy. This is the hot path the engine
// calls at every enforcement point; it is a cheap read of a cached value.
func (m *Manager) Policy() Policy {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.current.Policy
}

// Status returns the current license snapshot for the UI.
func (m *Manager) Status() Status {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.current
}

// reevaluate recomputes the cached Status from the persisted certificate.
func (m *Manager) reevaluate() {
	snap := m.store.snapshot()
	status := Status{
		DeviceID:   snap.DeviceID,
		DeviceName: snap.DeviceName,
		Health:     HealthNone,
		Tier:       TierFree,
		Policy:     FreePolicy(),
	}
	if snap.Token != "" {
		if ent, err := ParseAndVerify(snap.Token, m.keys); err == nil {
			health, policy := ent.Evaluate(snap.DeviceID, time.Now())
			status.Health = health
			status.Policy = policy
			status.Tier = policy.Tier
			status.Licensed = true
			status.LicenseID = ent.LicenseID
			status.Product = ent.Product
			status.Edition = ent.Edition
			status.VersionScope = ent.VersionScope
			status.DeviceLimit = ent.DeviceLimit
			status.IssuedAt = ent.IssuedAt
			status.RefreshBy = ent.RefreshBy
			status.Message = messageFor(health)
		}
		// A certificate that fails verification is ignored (stays Free) but left
		// on disk; a future key rotation or app update may make it valid again.
	}
	m.mu.Lock()
	m.current = status
	m.mu.Unlock()
}

func messageFor(h Health) string {
	switch h {
	case HealthGrace:
		return "Grabify Pro is active, but couldn't reconnect to confirm your license recently. Connect to the internet to keep Pro features."
	case HealthExpired:
		return "Grabify Pro couldn't be confirmed and has paused. Reconnect to the internet to restore Pro features — your settings and queue are kept."
	case HealthRevoked:
		return "This license is no longer active (it may have been refunded or disputed). Grabify has returned to the free tier."
	default:
		return ""
	}
}

// adoptToken verifies a newly obtained certificate before storing it, so a
// malformed or mis-bound certificate from the server never overwrites a good one.
func (m *Manager) adoptToken(token, licenseKey string) error {
	ent, err := ParseAndVerify(token, m.keys)
	if err != nil {
		return err
	}
	snap := m.store.snapshot()
	if ent.DeviceID != snap.DeviceID {
		return errors.New("the certificate was issued for a different device")
	}
	if err := m.store.update(func(s *state) {
		s.Token = token
		if licenseKey != "" {
			s.LicenseKey = licenseKey
		}
	}); err != nil {
		return err
	}
	m.reevaluate()
	return nil
}

// Activate binds this device to a license key and stores the returned
// certificate. Returns the updated Status on success.
func (m *Manager) Activate(ctx context.Context, licenseKey string) (Status, error) {
	licenseKey = strings.TrimSpace(licenseKey)
	if licenseKey == "" {
		return m.Status(), errors.New("enter your license key")
	}
	snap := m.store.snapshot()
	token, _, err := m.client.Activate(ctx, licenseKey, snap.DeviceID, snap.DeviceName)
	if err != nil {
		return m.Status(), err
	}
	if err := m.adoptToken(token, licenseKey); err != nil {
		return m.Status(), err
	}
	return m.Status(), nil
}

// Refresh re-issues the certificate for this device using the stored license
// key. Used on startup and on demand to extend the offline window and pick up
// status changes (e.g. a refund).
func (m *Manager) Refresh(ctx context.Context) (Status, error) {
	snap := m.store.snapshot()
	if snap.LicenseKey == "" {
		return m.Status(), errors.New("this device is not activated")
	}
	token, err := m.client.Refresh(ctx, snap.LicenseKey, snap.DeviceID)
	if err != nil {
		return m.Status(), err
	}
	if err := m.adoptToken(token, snap.LicenseKey); err != nil {
		return m.Status(), err
	}
	return m.Status(), nil
}

// RefreshDue reports whether an online refresh is worth attempting: the device
// is activated and its certificate is outside the healthy window.
func (m *Manager) RefreshDue() bool {
	m.mu.RLock()
	health := m.current.Health
	m.mu.RUnlock()
	if m.store.snapshot().LicenseKey == "" {
		return false
	}
	return health == HealthGrace || health == HealthExpired
}

// Deactivate releases a device slot. If targetDeviceID is empty or this device,
// the local certificate is also cleared, returning this install to Free.
func (m *Manager) Deactivate(ctx context.Context, targetDeviceID string) (Status, error) {
	snap := m.store.snapshot()
	if snap.LicenseKey == "" {
		return m.Status(), errors.New("this device is not activated")
	}
	target := strings.TrimSpace(targetDeviceID)
	if target == "" {
		target = snap.DeviceID
	}
	if err := m.client.Deactivate(ctx, snap.LicenseKey, snap.DeviceID, target); err != nil {
		return m.Status(), err
	}
	if target == snap.DeviceID {
		if err := m.store.update(func(s *state) {
			s.Token = ""
			s.LicenseKey = ""
		}); err != nil {
			return m.Status(), err
		}
		m.reevaluate()
	}
	return m.Status(), nil
}

// Devices lists the devices activated on this license, marking the current one.
func (m *Manager) Devices(ctx context.Context) ([]Device, error) {
	snap := m.store.snapshot()
	if snap.LicenseKey == "" {
		return nil, errors.New("this device is not activated")
	}
	devices, err := m.client.Devices(ctx, snap.LicenseKey, snap.DeviceID)
	if err != nil {
		return nil, err
	}
	for i := range devices {
		if devices[i].DeviceID == snap.DeviceID {
			devices[i].Current = true
		}
	}
	return devices, nil
}

// Recover asks the backend to email the license key for an address.
func (m *Manager) Recover(ctx context.Context, email string) error {
	email = strings.TrimSpace(email)
	if email == "" || !strings.Contains(email, "@") {
		return errors.New("enter the email address you purchased with")
	}
	return m.client.Recover(ctx, email)
}
