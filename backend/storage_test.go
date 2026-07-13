package backend

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestSQLiteRoundTripAndWAL(t *testing.T) {
	dir := t.TempDir()
	m, err := NewManager(dir, nil)
	if err != nil {
		t.Fatal(err)
	}
	m.mu.Lock()
	m.downloads["saved"] = &Download{ID: "saved", URL: "https://example.test/file", Filename: "file", DestinationPath: dir, Category: "general", Kind: "http", State: Paused, DateAdded: NowISO(), ETag: `"v1"`, Segments: []SegmentProgress{{Index: 0, From: 0, To: 9, Done: 4}}}
	m.order = []string{"saved"}
	limit := int64(1234)
	m.limits["saved"] = &limit
	m.mu.Unlock()
	if err = m.save(); err != nil {
		t.Fatal(err)
	}
	m.Close()
	if _, err = os.Stat(filepath.Join(dir, "rivlet.db")); err != nil {
		t.Fatal(err)
	}
	m2, err := NewManager(dir, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer m2.Close()
	got := m2.List()
	if len(got) != 1 || got[0].ETag != `"v1"` || len(got[0].Segments) != 1 || got[0].Segments[0].Done != 4 {
		t.Fatalf("bad database round trip: %+v", got)
	}
	var mode string
	if err = m2.db.QueryRow(`PRAGMA journal_mode`).Scan(&mode); err != nil || mode != "wal" {
		t.Fatalf("WAL unavailable: %q %v", mode, err)
	}
}

func TestLegacyJSONMigratesOnce(t *testing.T) {
	dir := t.TempDir()
	legacy := persisted{Settings: Settings{DownloadDir: dir, MaxConcurrent: 2}, Downloads: []*Download{{ID: "legacy", URL: "https://example.test/a", Filename: "a", DestinationPath: dir, Category: "general", Kind: "http", State: Paused, DateAdded: NowISO()}}}
	b, _ := json.Marshal(legacy)
	if err := os.WriteFile(filepath.Join(dir, "state.json"), b, 0600); err != nil {
		t.Fatal(err)
	}
	m, err := NewManager(dir, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer m.Close()
	if got := m.List(); len(got) != 1 || got[0].ID != "legacy" {
		t.Fatalf("migration failed: %+v", got)
	}
	if _, err = os.Stat(filepath.Join(dir, "state.json.migrated.bak")); err != nil {
		t.Fatal("legacy backup missing:", err)
	}
}

func TestCorruptDatabaseRecoversFromVerifiedBackup(t *testing.T) {
	dir := t.TempDir()
	m, err := NewManager(dir, nil)
	if err != nil {
		t.Fatal(err)
	}
	m.mu.Lock()
	m.downloads["recover"] = &Download{ID: "recover", URL: "https://example.test/r", Filename: "r", DestinationPath: dir, Category: "general", Kind: "http", State: Paused, DateAdded: NowISO()}
	m.order = []string{"recover"}
	m.mu.Unlock()
	if err = m.save(); err != nil {
		t.Fatal(err)
	}
	m.Close()
	path := filepath.Join(dir, "rivlet.db")
	if err = os.WriteFile(path, []byte("not a sqlite database"), 0600); err != nil {
		t.Fatal(err)
	}
	m2, err := NewManager(dir, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer m2.Close()
	if got := m2.List(); len(got) != 1 || got[0].ID != "recover" {
		t.Fatalf("backup recovery failed: %+v", got)
	}
	matches, _ := filepath.Glob(path + ".corrupt-*")
	if len(matches) != 1 {
		t.Fatalf("corrupt database was not quarantined: %v", matches)
	}
}
