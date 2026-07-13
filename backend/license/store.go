package license

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
)

// state is the persisted license state for this install. It is stored as a small
// JSON file beside the app's other state. It holds no secrets: the certificate
// is a signed public artifact, and the license key is the same value the user
// received by email.
type state struct {
	DeviceID   string `json:"deviceId"`
	DeviceName string `json:"deviceName"`
	LicenseKey string `json:"licenseKey,omitempty"` // key the user activated with, for silent refresh
	Token      string `json:"token,omitempty"`      // signed entitlement certificate
	UpdatedAt  string `json:"updatedAt,omitempty"`
}

// store owns reading and writing the license state file. A single Manager owns a
// store; its methods are guarded so concurrent activate/refresh calls are safe.
type store struct {
	mu   sync.Mutex
	path string
	st   state
}

// openStore loads (or initializes) the license state at path, ensuring a stable
// per-install DeviceID exists.
func openStore(path string) (*store, error) {
	s := &store{path: path}
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return nil, err
	}
	if raw, err := os.ReadFile(path); err == nil {
		_ = json.Unmarshal(raw, &s.st) // a corrupt file is treated as empty; DeviceID is regenerated below
	}
	changed := false
	if s.st.DeviceID == "" {
		id, err := newDeviceID()
		if err != nil {
			return nil, err
		}
		s.st.DeviceID = id
		changed = true
	}
	if s.st.DeviceName == "" {
		s.st.DeviceName = defaultDeviceName()
		changed = true
	}
	if changed {
		if err := s.persistLocked(); err != nil {
			return nil, err
		}
	}
	return s, nil
}

// snapshot returns a copy of the current state.
func (s *store) snapshot() state {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.st
}

// update applies mutate under the lock and persists the result atomically.
func (s *store) update(mutate func(*state)) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	mutate(&s.st)
	return s.persistLocked()
}

// persistLocked writes the state atomically (temp file + rename) so a crash
// mid-write cannot corrupt the certificate.
func (s *store) persistLocked() error {
	s.st.UpdatedAt = nowISO()
	raw, err := json.MarshalIndent(s.st, "", "  ")
	if err != nil {
		return err
	}
	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, raw, 0600); err != nil {
		return err
	}
	return os.Rename(tmp, s.path)
}
