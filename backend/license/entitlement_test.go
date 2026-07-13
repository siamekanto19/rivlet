package license

import (
	"crypto/ed25519"
	"testing"
	"time"
)

const testKID = "test-key-1"

// newTestKeys generates an ephemeral signing key and the matching trusted key
// set, so certificate tests never depend on baked-in or env-supplied keys.
func newTestKeys(t *testing.T) (ed25519.PrivateKey, KeySet) {
	t.Helper()
	pub, priv, err := ed25519.GenerateKey(nil)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}
	return priv, KeySet{testKID: pub}
}

func sampleEntitlement(deviceID string, issued time.Time, offlineDays, graceDays int) Entitlement {
	return Entitlement{
		Version:      1,
		LicenseID:    "lic_123",
		Product:      "rivlet-pro-lifetime",
		Tier:         TierPro,
		Edition:      "lifetime",
		VersionScope: "1.x",
		DeviceID:     deviceID,
		DeviceName:   "Test PC",
		DeviceLimit:  3,
		Status:       StatusActive,
		IssuedAt:     issued.UTC().Format(time.RFC3339),
		RefreshBy:    issued.AddDate(0, 0, offlineDays).UTC().Format(time.RFC3339),
		GraceDays:    graceDays,
	}
}

func TestSignVerifyRoundTrip(t *testing.T) {
	priv, keys := newTestKeys(t)
	ent := sampleEntitlement("dev-abc", time.Now(), 90, 30)
	token, err := SignEntitlement(priv, testKID, ent)
	if err != nil {
		t.Fatalf("sign: %v", err)
	}
	got, err := ParseAndVerify(token, keys)
	if err != nil {
		t.Fatalf("verify: %v", err)
	}
	if got.LicenseID != ent.LicenseID || got.DeviceID != ent.DeviceID || got.Tier != TierPro {
		t.Fatalf("round-trip mismatch: %+v", got)
	}
}

func TestVerifyRejectsTampering(t *testing.T) {
	priv, keys := newTestKeys(t)
	token, err := SignEntitlement(priv, testKID, sampleEntitlement("dev-abc", time.Now(), 90, 30))
	if err != nil {
		t.Fatal(err)
	}
	// Flip a character in the payload segment.
	tampered := []byte(token)
	dot := 0
	for i, c := range tampered {
		if c == '.' {
			dot++
			if dot == 1 {
				// mutate the first payload byte after the first dot
				if i+1 < len(tampered) {
					if tampered[i+1] == 'A' {
						tampered[i+1] = 'B'
					} else {
						tampered[i+1] = 'A'
					}
				}
				break
			}
		}
	}
	if _, err := ParseAndVerify(string(tampered), keys); err == nil {
		t.Fatal("expected verification to fail on tampered token")
	}
}

func TestVerifyRejectsUnknownKey(t *testing.T) {
	priv, _ := newTestKeys(t)
	token, err := SignEntitlement(priv, testKID, sampleEntitlement("dev-abc", time.Now(), 90, 30))
	if err != nil {
		t.Fatal(err)
	}
	_, otherKeys := newTestKeys(t) // a different, unrelated trusted set
	if _, err := ParseAndVerify(token, otherKeys); err == nil {
		t.Fatal("expected verification to fail with a key set that does not contain the signer")
	}
}

func TestEvaluateWindows(t *testing.T) {
	priv, keys := newTestKeys(t)
	issued := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	token, err := SignEntitlement(priv, testKID, sampleEntitlement("dev-abc", issued, 90, 30))
	if err != nil {
		t.Fatal(err)
	}
	ent, err := ParseAndVerify(token, keys)
	if err != nil {
		t.Fatal(err)
	}

	cases := []struct {
		name       string
		now        time.Time
		device     string
		wantHealth Health
		wantPro    bool
	}{
		{"active", issued.AddDate(0, 0, 30), "dev-abc", HealthActive, true},
		{"grace", issued.AddDate(0, 0, 100), "dev-abc", HealthGrace, true},
		{"expired", issued.AddDate(0, 0, 200), "dev-abc", HealthExpired, false},
		{"wrong device", issued.AddDate(0, 0, 30), "dev-other", HealthNone, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			health, policy := ent.Evaluate(tc.device, tc.now)
			if health != tc.wantHealth {
				t.Fatalf("health = %s, want %s", health, tc.wantHealth)
			}
			if policy.IsPro() != tc.wantPro {
				t.Fatalf("isPro = %v, want %v", policy.IsPro(), tc.wantPro)
			}
		})
	}
}

func TestEvaluateRevoked(t *testing.T) {
	priv, keys := newTestKeys(t)
	ent := sampleEntitlement("dev-abc", time.Now(), 90, 30)
	ent.Status = StatusRefunded
	token, err := SignEntitlement(priv, testKID, ent)
	if err != nil {
		t.Fatal(err)
	}
	verified, err := ParseAndVerify(token, keys)
	if err != nil {
		t.Fatal(err)
	}
	health, policy := verified.Evaluate("dev-abc", time.Now())
	if health != HealthRevoked || policy.IsPro() {
		t.Fatalf("refunded license should revoke Pro, got health=%s pro=%v", health, policy.IsPro())
	}
}

func TestPolicyShapes(t *testing.T) {
	free := FreePolicy()
	pro := ProPolicy()
	if free.MaxActiveDownloads != 3 || free.MaxConnectionsPerDownload != 4 || free.MaxVideoHeight != 720 {
		t.Fatalf("free policy limits wrong: %+v", free)
	}
	if free.AllowCustomQueues || free.AllowProxy || free.AllowScheduling || free.AllowPerScopeBandwidth {
		t.Fatalf("free policy should not grant Pro features: %+v", free)
	}
	if pro.MaxActiveDownloads != 16 || pro.MaxConnectionsPerDownload != 16 || pro.MaxDevices != 3 {
		t.Fatalf("pro policy limits wrong: %+v", pro)
	}
	if pro.MaxVideoHeight != 0 || !pro.AllowVideoFormatChoice {
		t.Fatalf("pro policy should allow unlimited video: %+v", pro)
	}
}
