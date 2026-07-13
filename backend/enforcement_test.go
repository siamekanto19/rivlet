package backend

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"rivlet/backend/license"
)

// peakCountingServer serves a ranged, resumable payload and records the peak
// number of simultaneous segment (ranged, non-probe) GET requests. A short delay
// per request forces the worker connections to overlap so the peak is
// meaningful.
func peakCountingServer(t *testing.T, size int) (*httptest.Server, func() int64) {
	t.Helper()
	payload := bytes.Repeat([]byte("g"), size)
	var inflight, peak int64
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		rangeHeader := r.Header.Get("Range")
		segment := r.Method == http.MethodGet && rangeHeader != "" && rangeHeader != "bytes=0-0"
		if segment {
			n := atomic.AddInt64(&inflight, 1)
			for {
				p := atomic.LoadInt64(&peak)
				if n <= p || atomic.CompareAndSwapInt64(&peak, p, n) {
					break
				}
			}
			time.Sleep(40 * time.Millisecond)
			atomic.AddInt64(&inflight, -1)
		}
		http.ServeContent(w, r, "file.bin", time.Time{}, bytes.NewReader(payload))
	}))
	return srv, func() int64 { return atomic.LoadInt64(&peak) }
}

// TestConnectionLimitIsEnforcedByTier proves the engine — not the UI — caps
// parallel connections per download: Free is held to 4, Pro is allowed to exceed
// it, even though both request 16 segments.
func TestConnectionLimitIsEnforcedByTier(t *testing.T) {
	const size = 40 * 1024 * 1024 // large enough to plan ~10 segments
	srv, peak := peakCountingServer(t, size)
	defer srv.Close()

	run := func(policy func() license.Policy) int64 {
		dir := t.TempDir()
		m, err := NewManager(dir, nil)
		if err != nil {
			t.Fatal(err)
		}
		defer m.Close()
		m.SetEntitlementProvider(policy)
		s := m.GetSettings()
		s.SegmentCount = 16 // ask for the maximum; the tier decides what is honored
		if err := m.UpdateSettings(s); err != nil {
			t.Fatal(err)
		}
		d, err := m.Add(AddRequest{URL: srv.URL + "/file.bin", DestinationPath: dir})
		if err != nil {
			t.Fatal(err)
		}
		waitForState(t, m, d.ID, Completed)
		return peak()
	}

	// Free first (default is Free, but be explicit).
	freePeak := run(license.FreePolicy)
	if freePeak > 4 {
		t.Fatalf("Free tier used %d parallel connections, must be capped at 4", freePeak)
	}

	// Reset the peak by pointing at a fresh server for the Pro run.
	srv2, peak2 := peakCountingServer(t, size)
	defer srv2.Close()
	dir := t.TempDir()
	m, err := NewManager(dir, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer m.Close()
	m.SetEntitlementProvider(license.ProPolicy)
	s := m.GetSettings()
	s.SegmentCount = 16
	if err := m.UpdateSettings(s); err != nil {
		t.Fatal(err)
	}
	d, err := m.Add(AddRequest{URL: srv2.URL + "/file.bin", DestinationPath: dir})
	if err != nil {
		t.Fatal(err)
	}
	waitForState(t, m, d.ID, Completed)
	if proPeak := peak2(); proPeak <= 4 {
		t.Fatalf("Pro tier used only %d parallel connections, expected more than the Free cap of 4", proPeak)
	}
}

// TestCompletionActionsGatedByTier verifies queue completion actions are honored
// only for Pro.
func TestCompletionActionsGatedByTier(t *testing.T) {
	dir := t.TempDir()
	m, err := NewManager(dir, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer m.Close()
	m.mu.Lock()
	m.settings.Queues = []Queue{{ID: "default", Name: "Downloads", MaxConcurrent: 2, Running: true, CompletionAction: "sleep"}}
	done := &Download{ID: "d1", QueueID: "default", State: Completed}
	m.downloads["d1"] = done
	m.order = []string{"d1"}
	m.mu.Unlock()

	m.SetEntitlementProvider(license.FreePolicy)
	m.mu.Lock()
	action, _ := m.completionPolicyLocked(done)
	m.mu.Unlock()
	if action != "" {
		t.Fatalf("Free must not run completion actions, got %q", action)
	}

	m.SetEntitlementProvider(license.ProPolicy)
	m.mu.Lock()
	action, _ = m.completionPolicyLocked(done)
	m.mu.Unlock()
	if action != "sleep" {
		t.Fatalf("Pro should run the queue completion action, got %q", action)
	}
}

// TestStoredCredentialGatedByTier verifies that persisting HTTP credentials is
// Pro-only, while a one-off secret still authenticates on Free.
func TestStoredCredentialGatedByTier(t *testing.T) {
	dir := t.TempDir()
	m, err := NewManager(dir, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer m.Close()
	m.SetEntitlementProvider(license.FreePolicy)

	d, err := m.Add(AddRequest{
		URL: "https://origin.invalid/f", DestinationPath: dir,
		AuthScheme: "basic", AuthUsername: "alice", AuthSecret: "secret", RememberCredential: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	m.Pause(d.ID) // don't actually attempt the (invalid) network fetch
	m.mu.RLock()
	target := m.downloads[d.ID].CredentialTarget
	_, inMemory := m.authSecrets[d.ID]
	m.mu.RUnlock()
	if target != "" {
		t.Fatalf("Free must not persist credentials, got target %q", target)
	}
	if !inMemory {
		t.Fatal("the one-off secret should still be held in memory for the session")
	}
}
