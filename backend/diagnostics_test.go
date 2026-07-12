package backend

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestDiagnosticsExportRedactsSecrets(t *testing.T) {
	dir := t.TempDir()
	m, err := NewManager(dir, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer m.Close()
	m.mu.Lock()
	m.downloads["secret"] = &Download{ID: "secret", URL: "https://user:pass@example.test/file?token=topsecret", Filename: "file", Kind: "http", State: Error, RequestUserAgent: "secret-agent", Referrer: "https://private.test"}
	m.order = []string{"secret"}
	m.mu.Unlock()
	m.recordDiagnostic("error", "http", "request", "Authorization: Bearer topsecret\nCookie: session=private")
	path := filepath.Join(dir, "diagnostics.json")
	if err = m.ExportDiagnostics(path); err != nil {
		t.Fatal(err)
	}
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	text := string(b)
	for _, secret := range []string{"topsecret", "session=private", "user:pass", "secret-agent", "private.test"} {
		if strings.Contains(text, secret) {
			t.Fatalf("diagnostics leaked %q: %s", secret, text)
		}
	}
	if !strings.Contains(text, "example.test") || !strings.Contains(text, "[REDACTED]") {
		t.Fatalf("sanitized evidence missing: %s", text)
	}
}
