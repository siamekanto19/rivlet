// Command grabify-licgen is a developer tool for the licensing system. It
// generates an Ed25519 signing keypair and mints signed entitlement
// certificates locally, so the desktop entitlement path can be exercised
// end-to-end before the Cloudflare backend exists.
//
// It is NOT shipped to end users and is not part of the app. The same
// certificate encoding is implemented by the production Worker (Track 2); this
// tool is the reference / test signer.
//
// Usage:
//
//	# 1. Generate a keypair. Set the public key so the app trusts dev certs:
//	go run ./cmd/grabify-licgen keygen
//	export GRABIFY_LICENSE_PUBKEY=<public key printed above>   # (set in the app's environment)
//
//	# 2. Mint a Pro certificate bound to a device id (see the app's License page):
//	go run ./cmd/grabify-licgen sign -priv <private key> -device dev-abc123 -license LIC-TEST-0001
//
// Paste the printed token where a certificate is expected, or drop it into the
// license.json "token" field for a quick offline test.
package main

import (
	"crypto/ed25519"
	"encoding/base64"
	"flag"
	"fmt"
	"os"
	"time"

	"idm-next/backend/license"
)

func main() {
	if len(os.Args) < 2 {
		usage()
	}
	switch os.Args[1] {
	case "keygen":
		keygen()
	case "sign":
		sign(os.Args[2:])
	default:
		usage()
	}
}

func usage() {
	fmt.Fprintln(os.Stderr, "usage: grabify-licgen <keygen|sign> [flags]")
	fmt.Fprintln(os.Stderr, "  keygen                 generate an Ed25519 keypair (base64)")
	fmt.Fprintln(os.Stderr, "  sign -priv <b64> ...   mint a signed entitlement certificate")
	os.Exit(2)
}

func keygen() {
	pub, priv, err := ed25519.GenerateKey(nil)
	if err != nil {
		fail(err)
	}
	fmt.Println("# Ed25519 keypair (base64 std). Keep the private key secret.")
	fmt.Printf("PUBLIC  (GRABIFY_LICENSE_PUBKEY / bake into keys.go): %s\n", base64.StdEncoding.EncodeToString(pub))
	fmt.Printf("PRIVATE (Worker secret / -priv for signing):          %s\n", base64.StdEncoding.EncodeToString(priv))
}

func sign(args []string) {
	fs := flag.NewFlagSet("sign", flag.ExitOnError)
	privB64 := fs.String("priv", "", "signing private key (base64 std), from keygen")
	device := fs.String("device", "", "device id to bind the certificate to (required)")
	deviceName := fs.String("device-name", "Dev Device", "human-friendly device name")
	licenseID := fs.String("license", "LIC-DEV-0001", "license id")
	product := fs.String("product", "grabify-pro-lifetime", "product id")
	edition := fs.String("edition", "lifetime", "edition")
	versionScope := fs.String("version-scope", "1.x", "covered major-version scope")
	status := fs.String("status", license.StatusActive, "active|refunded|revoked")
	deviceLimit := fs.Int("device-limit", 3, "device allowance")
	offlineDays := fs.Int("offline-days", 90, "days of offline validity before refresh is needed")
	graceDays := fs.Int("grace-days", 30, "grace days past the offline window")
	kid := fs.String("kid", license.DevKID, "signing key id (header kid)")
	_ = fs.Parse(args)

	if *device == "" {
		fail(fmt.Errorf("-device is required (find it on the app's License & devices page)"))
	}
	raw, err := base64.StdEncoding.DecodeString(*privB64)
	if err != nil || len(raw) != ed25519.PrivateKeySize {
		fail(fmt.Errorf("-priv must be a base64 Ed25519 private key from keygen"))
	}
	now := time.Now().UTC()
	ent := license.Entitlement{
		Version:      1,
		LicenseID:    *licenseID,
		Product:      *product,
		Tier:         license.TierPro,
		Edition:      *edition,
		VersionScope: *versionScope,
		DeviceID:     *device,
		DeviceName:   *deviceName,
		DeviceLimit:  *deviceLimit,
		Status:       *status,
		IssuedAt:     now.Format(time.RFC3339),
		RefreshBy:    now.AddDate(0, 0, *offlineDays).Format(time.RFC3339),
		GraceDays:    *graceDays,
	}
	token, err := license.SignEntitlement(ed25519.PrivateKey(raw), *kid, ent)
	if err != nil {
		fail(err)
	}
	fmt.Println(token)
}

func fail(err error) {
	fmt.Fprintln(os.Stderr, "error:", err)
	os.Exit(1)
}
