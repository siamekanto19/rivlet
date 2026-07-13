package license

import (
	"path/filepath"
	"testing"
	"time"
)

// newManagerWithKeys builds a Manager over a temp state file and swaps in a
// test key set, so the offline evaluation path can be exercised without any
// baked-in or env-supplied production key.
func newManagerWithKeys(t *testing.T) (*Manager, KeySet, interface {
	sign(Entitlement) string
}) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "license.json")
	m, err := NewManager(path)
	if err != nil {
		t.Fatalf("new manager: %v", err)
	}
	priv, keys := newTestKeys(t)
	m.keys = keys
	m.reevaluate()
	signer := signerFunc(func(ent Entitlement) string {
		tok, err := SignEntitlement(priv, testKID, ent)
		if err != nil {
			t.Fatalf("sign: %v", err)
		}
		return tok
	})
	return m, keys, signer
}

type signerFunc func(Entitlement) string

func (f signerFunc) sign(ent Entitlement) string { return f(ent) }

func TestManagerStartsFree(t *testing.T) {
	m, _, _ := newManagerWithKeys(t)
	if m.Policy().IsPro() {
		t.Fatal("a fresh install must be Free")
	}
	st := m.Status()
	if st.Licensed || st.Health != HealthNone || st.DeviceID == "" {
		t.Fatalf("unexpected fresh status: %+v", st)
	}
}

func TestManagerAdoptsProCertificate(t *testing.T) {
	m, _, signer := newManagerWithKeys(t)
	device := m.Status().DeviceID
	token := signer.sign(sampleEntitlement(device, time.Now(), 90, 30))
	if err := m.adoptToken(token, "GRBFY-TEST-KEY"); err != nil {
		t.Fatalf("adopt: %v", err)
	}
	if !m.Policy().IsPro() {
		t.Fatal("expected Pro after adopting a valid certificate")
	}
	st := m.Status()
	if !st.Licensed || st.Health != HealthActive || st.Policy.MaxActiveDownloads != 16 {
		t.Fatalf("unexpected pro status: %+v", st)
	}
}

func TestManagerRejectsWrongDeviceCertificate(t *testing.T) {
	m, _, signer := newManagerWithKeys(t)
	token := signer.sign(sampleEntitlement("dev-someone-else", time.Now(), 90, 30))
	if err := m.adoptToken(token, "KEY"); err == nil {
		t.Fatal("expected adoption to fail for a certificate bound to another device")
	}
	if m.Policy().IsPro() {
		t.Fatal("policy must remain Free after rejecting a mis-bound certificate")
	}
}

func TestManagerExpiredCertificateIsFree(t *testing.T) {
	m, _, signer := newManagerWithKeys(t)
	device := m.Status().DeviceID
	// Issued long ago, well past offline window + grace.
	token := signer.sign(sampleEntitlement(device, time.Now().AddDate(0, 0, -400), 90, 30))
	if err := m.adoptToken(token, "KEY"); err != nil {
		t.Fatalf("adopt: %v", err)
	}
	if m.Policy().IsPro() {
		t.Fatal("expired certificate must resolve to Free")
	}
	if m.Status().Health != HealthExpired {
		t.Fatalf("expected expired health, got %s", m.Status().Health)
	}
	if !m.RefreshDue() {
		t.Fatal("an expired, keyed device should be due for refresh")
	}
}

func TestManagerPersistsAcrossReload(t *testing.T) {
	path := filepath.Join(t.TempDir(), "license.json")
	m, err := NewManager(path)
	if err != nil {
		t.Fatal(err)
	}
	priv, keys := newTestKeys(t)
	m.keys = keys
	m.reevaluate()
	device := m.Status().DeviceID
	token, err := SignEntitlement(priv, testKID, sampleEntitlement(device, time.Now(), 90, 30))
	if err != nil {
		t.Fatal(err)
	}
	if err := m.adoptToken(token, "KEY"); err != nil {
		t.Fatal(err)
	}

	// Reload from disk with the same trusted keys: the device id and certificate
	// must survive, keeping Pro.
	m2, err := NewManager(path)
	if err != nil {
		t.Fatal(err)
	}
	m2.keys = keys
	m2.reevaluate()
	if m2.Status().DeviceID != device {
		t.Fatal("device id must be stable across reloads")
	}
	if !m2.Policy().IsPro() {
		t.Fatal("a stored valid certificate must restore Pro on reload")
	}
}
