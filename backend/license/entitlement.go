package license

import (
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
)

// Entitlement is the set of claims carried by a signed certificate. It is minted
// only by the licensing backend and verified offline by the desktop app. It
// deliberately carries no payment or personal data beyond what the client needs
// to enforce limits and drive the License & devices UI.
type Entitlement struct {
	Version      int    `json:"v"`
	LicenseID    string `json:"licenseId"`
	Product      string `json:"product"`      // e.g. "grabify-pro-lifetime"
	Tier         string `json:"tier"`         // TierPro
	Edition      string `json:"edition"`      // e.g. "lifetime"
	VersionScope string `json:"versionScope"` // e.g. "1.x" — major versions this license covers
	DeviceID     string `json:"deviceId"`     // the device this certificate is bound to
	DeviceName   string `json:"deviceName,omitempty"`
	DeviceLimit  int    `json:"deviceLimit"`
	Status       string `json:"status"`    // StatusActive | StatusRefunded | StatusRevoked
	IssuedAt     string `json:"issuedAt"`  // RFC3339
	RefreshBy    string `json:"refreshBy"` // RFC3339 — validate online again before this (issuedAt + offline window)
	GraceDays    int    `json:"graceDays"` // extra days Pro persists past RefreshBy before dropping to Free
}

// Entitlement status values.
const (
	StatusActive   = "active"
	StatusRefunded = "refunded"
	StatusRevoked  = "revoked"
)

// Health describes where the current device sits relative to the offline
// validation window.
type Health string

const (
	// HealthActive: verified and within the offline validation window.
	HealthActive Health = "active"
	// HealthGrace: past RefreshBy but within the grace period; still Pro, but the
	// UI should nudge the user to reconnect.
	HealthGrace Health = "grace"
	// HealthExpired: past RefreshBy + grace; new actions revert to Free until the
	// license is refreshed online.
	HealthExpired Health = "expired"
	// HealthRevoked: refunded/disputed/charged back; Pro is withdrawn.
	HealthRevoked Health = "revoked"
	// HealthNone: no (valid) certificate present.
	HealthNone Health = "none"
)

const currentEntitlementVersion = 1

// tokenHeader is the compact JWS-style header. The desktop verifier selects the
// trusted public key by KID, so keys can be rotated without a client update that
// only trusts one key.
type tokenHeader struct {
	Alg string `json:"alg"` // always "EdDSA"
	Kid string `json:"kid"` // key id, matched against the trusted key set
}

var b64 = base64.RawURLEncoding

// SignEntitlement produces a compact certificate string
// (base64url(header).base64url(payload).base64url(signature)) over the given
// claims. This lives here so the dev signing tool and tests can mint
// certificates with a locally-generated key; production certificates are minted
// by the Cloudflare Worker using the exact same encoding.
func SignEntitlement(priv ed25519.PrivateKey, kid string, ent Entitlement) (string, error) {
	if len(priv) != ed25519.PrivateKeySize {
		return "", errors.New("invalid ed25519 private key")
	}
	if ent.Version == 0 {
		ent.Version = currentEntitlementVersion
	}
	header, err := json.Marshal(tokenHeader{Alg: "EdDSA", Kid: kid})
	if err != nil {
		return "", err
	}
	payload, err := json.Marshal(ent)
	if err != nil {
		return "", err
	}
	signingInput := b64.EncodeToString(header) + "." + b64.EncodeToString(payload)
	sig := ed25519.Sign(priv, []byte(signingInput))
	return signingInput + "." + b64.EncodeToString(sig), nil
}

// ParseAndVerify decodes a certificate, verifies its signature against the
// trusted key set, and returns the claims. It does NOT evaluate the time window
// or device binding — call Evaluate for that.
func ParseAndVerify(token string, keys KeySet) (Entitlement, error) {
	parts := strings.Split(strings.TrimSpace(token), ".")
	if len(parts) != 3 {
		return Entitlement{}, errors.New("malformed certificate")
	}
	headerBytes, err := b64.DecodeString(parts[0])
	if err != nil {
		return Entitlement{}, fmt.Errorf("malformed certificate header: %w", err)
	}
	var header tokenHeader
	if err := json.Unmarshal(headerBytes, &header); err != nil {
		return Entitlement{}, fmt.Errorf("malformed certificate header: %w", err)
	}
	if header.Alg != "EdDSA" {
		return Entitlement{}, fmt.Errorf("unsupported certificate algorithm %q", header.Alg)
	}
	pub, ok := keys.Lookup(header.Kid)
	if !ok {
		return Entitlement{}, fmt.Errorf("certificate signed by unknown key %q", header.Kid)
	}
	sig, err := b64.DecodeString(parts[2])
	if err != nil {
		return Entitlement{}, fmt.Errorf("malformed certificate signature: %w", err)
	}
	signingInput := parts[0] + "." + parts[1]
	if !ed25519.Verify(pub, []byte(signingInput), sig) {
		return Entitlement{}, errors.New("certificate signature is not valid")
	}
	payloadBytes, err := b64.DecodeString(parts[1])
	if err != nil {
		return Entitlement{}, fmt.Errorf("malformed certificate payload: %w", err)
	}
	var ent Entitlement
	if err := json.Unmarshal(payloadBytes, &ent); err != nil {
		return Entitlement{}, fmt.Errorf("malformed certificate payload: %w", err)
	}
	if ent.Version != currentEntitlementVersion {
		return Entitlement{}, fmt.Errorf("unsupported certificate version %d", ent.Version)
	}
	return ent, nil
}

// Evaluate resolves a verified entitlement into a health state and Policy for a
// given device and moment. A nil/invalid entitlement, a device mismatch, a
// revoked status, or an expired window all collapse to the Free policy — Pro is
// only ever granted by a positive check.
func (ent Entitlement) Evaluate(deviceID string, now time.Time) (Health, Policy) {
	// A certificate is bound to one device. If it does not match this machine it
	// grants nothing here (the user must activate this device).
	if deviceID == "" || ent.DeviceID != deviceID {
		return HealthNone, FreePolicy()
	}
	if ent.Tier != TierPro {
		return HealthNone, FreePolicy()
	}
	if ent.Status == StatusRefunded || ent.Status == StatusRevoked {
		return HealthRevoked, FreePolicy()
	}
	refreshBy, err := time.Parse(time.RFC3339, ent.RefreshBy)
	if err != nil {
		// A Pro certificate with an unparseable window is treated as expired
		// rather than trusted indefinitely.
		return HealthExpired, FreePolicy()
	}
	if now.Before(refreshBy) || now.Equal(refreshBy) {
		return HealthActive, ProPolicy()
	}
	graceEnd := refreshBy.AddDate(0, 0, maxInt(ent.GraceDays, 0))
	if now.Before(graceEnd) {
		return HealthGrace, ProPolicy()
	}
	return HealthExpired, FreePolicy()
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}
