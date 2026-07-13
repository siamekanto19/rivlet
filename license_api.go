package main

import (
	"context"
	"errors"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
	"rivlet/backend/license"
)

// upgradeURL is the public Cloudflare Pages landing page. The pricing section
// owns the Paddle checkout, so every desktop upgrade action lands on the same
// live purchase flow as the website.
const upgradeURL = "https://rivlet.pro/#pricing"

// licenseCtx bounds a licensing-server call. The desktop UI stays responsive; a
// slow or unreachable server surfaces as a clear error rather than hanging.
func (a *App) licenseCtx() (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), 25*time.Second)
}

func (a *App) emitLicense(status license.Status) {
	if a.ctx != nil {
		runtime.EventsEmit(a.ctx, "licenseChanged", status)
	}
}

// LicenseStatus returns the current entitlement snapshot (tier, health, policy,
// device info). Always safe to call; returns a Free snapshot if licensing failed
// to initialize.
func (a *App) LicenseStatus() license.Status {
	if a.license == nil {
		return license.Status{Tier: license.TierFree, Health: license.HealthNone, Policy: license.FreePolicy()}
	}
	return a.license.Status()
}

// ActivateLicense binds this device to a license key and stores the returned
// entitlement certificate.
func (a *App) ActivateLicense(key string) (license.Status, error) {
	if a.license == nil {
		return a.LicenseStatus(), errors.New("licensing is unavailable")
	}
	ctx, cancel := a.licenseCtx()
	defer cancel()
	status, err := a.license.Activate(ctx, key)
	if err == nil {
		a.emitLicense(status)
	}
	return status, err
}

// RefreshLicense re-validates this device online, extending the offline window
// and picking up status changes (e.g. a refund).
func (a *App) RefreshLicense() (license.Status, error) {
	if a.license == nil {
		return a.LicenseStatus(), errors.New("licensing is unavailable")
	}
	ctx, cancel := a.licenseCtx()
	defer cancel()
	status, err := a.license.Refresh(ctx)
	if err == nil {
		a.emitLicense(status)
	}
	return status, err
}

// DeactivateDevice releases a device slot. An empty targetDeviceID deactivates
// this device (returning it to Free).
func (a *App) DeactivateDevice(targetDeviceID string) (license.Status, error) {
	if a.license == nil {
		return a.LicenseStatus(), errors.New("licensing is unavailable")
	}
	ctx, cancel := a.licenseCtx()
	defer cancel()
	status, err := a.license.Deactivate(ctx, targetDeviceID)
	if err == nil {
		a.emitLicense(status)
	}
	return status, err
}

// ListLicenseDevices returns the devices activated on this license.
func (a *App) ListLicenseDevices() ([]license.Device, error) {
	if a.license == nil {
		return nil, errors.New("licensing is unavailable")
	}
	ctx, cancel := a.licenseCtx()
	defer cancel()
	return a.license.Devices(ctx)
}

// RecoverLicense asks the backend to email the license key for an address.
func (a *App) RecoverLicense(email string) error {
	if a.license == nil {
		return errors.New("licensing is unavailable")
	}
	ctx, cancel := a.licenseCtx()
	defer cancel()
	return a.license.Recover(ctx, email)
}

// OpenUpgradePage opens the Rivlet pricing/checkout page in the user's browser.
func (a *App) OpenUpgradePage() error {
	if a.ctx == nil {
		return errors.New("app not ready")
	}
	runtime.BrowserOpenURL(a.ctx, upgradeURL)
	return nil
}
