package license

import (
	"crypto/rand"
	"encoding/hex"
	"os"
	"strings"
)

// DeviceID is a random, per-install identifier generated once and stored beside
// the license state. It is NOT derived from hardware — Rivlet is privacy-first
// and does no hardware fingerprinting or telemetry. The licensing backend counts
// distinct DeviceIDs to enforce the device allowance; a reinstall that discards
// state simply looks like a new device, which the user can reclaim via
// self-service deactivation.
func newDeviceID() (string, error) {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return "dev-" + hex.EncodeToString(buf), nil
}

// defaultDeviceName is a human-friendly label for this device, shown in the
// device list. Falls back gracefully when the hostname is unavailable.
func defaultDeviceName() string {
	if host, err := os.Hostname(); err == nil {
		host = strings.TrimSpace(host)
		if host != "" {
			return host
		}
	}
	return "This PC"
}
