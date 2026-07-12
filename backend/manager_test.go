package backend

import (
	"crypto/sha256"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestSegmentedDownloadAndJSONContract(t *testing.T) {
	payload := []byte(strings.Repeat("idm-next-range-test-", 10000))
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Accept-Ranges", "bytes")
		if r.Method == http.MethodHead {
			w.Header().Set("Content-Length", strconv.Itoa(len(payload)))
			return
		}
		start, end := int64(0), int64(len(payload)-1)
		if h := r.Header.Get("Range"); h != "" {
			_, _ = fmt.Sscanf(h, "bytes=%d-%d", &start, &end)
			w.Header().Set("Content-Range", fmt.Sprintf("bytes %d-%d/%d", start, end, len(payload)))
			w.Header().Set("Content-Length", strconv.FormatInt(end-start+1, 10))
			w.WriteHeader(http.StatusPartialContent)
		}
		_, _ = w.Write(payload[start : end+1])
	}))
	defer srv.Close()

	dir := t.TempDir()
	m, err := NewManager(dir, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer m.Close()
	d, err := m.Add(AddRequest{URL: srv.URL + "/archive.bin", DestinationPath: dir})
	if err != nil {
		t.Fatal(err)
	}
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		for _, got := range m.List() {
			if got.ID == d.ID && got.State == Completed {
				b, readErr := os.ReadFile(dir + string(os.PathSeparator) + "archive.bin")
				if readErr != nil {
					t.Fatal(readErr)
				}
				if string(b) != string(payload) {
					t.Fatalf("downloaded payload differs: got %d bytes", len(b))
				}
				if len(got.Segments) != 1 || !got.SupportsResume || got.ProgressPct != 100 {
					t.Fatalf("bad completed contract: %+v", got)
				}
				if got.HTTPVersion == "" || got.NewConnections+got.ReusedConnections < 1 {
					t.Fatalf("connection metrics missing: %+v", got)
				}
				return
			}
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatalf("download did not complete: %+v", m.List())
}

func TestAdaptiveSegmentCount(t *testing.T) {
	if got := adaptiveSegmentCount(1024*1024, 16); got != 1 {
		t.Fatalf("small file should use one connection, got %d", got)
	}
	if got := adaptiveSegmentCount(128*1024*1024, 16); got != 16 {
		t.Fatalf("large file should use configured maximum, got %d", got)
	}
}

func TestDynamicWorkQueueCreatesMoreJobsThanConnections(t *testing.T) {
	segments := makeWorkSegments(128*1024*1024, 4)
	if len(segments) <= 4 {
		t.Fatalf("work queue must have more jobs than workers: %d", len(segments))
	}
	var covered int64
	for i, s := range segments {
		if s.Index != i || s.From != covered || s.To < s.From {
			t.Fatalf("invalid segment %d: %+v", i, s)
		}
		covered = s.To + 1
	}
	if covered != 128*1024*1024 {
		t.Fatalf("ranges cover %d bytes", covered)
	}
}

func TestDownloadFallsBackWhenHeadAndRangesAreRejected(t *testing.T) {
	payload := []byte("a server does not need HEAD or ranges to be downloadable")
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodHead {
			http.Error(w, "no head", http.StatusMethodNotAllowed)
			return
		}
		w.Header().Set("Content-Length", strconv.Itoa(len(payload)))
		_, _ = w.Write(payload)
	}))
	defer srv.Close()
	dir := t.TempDir()
	m, err := NewManager(dir, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer m.Close()
	d, err := m.Add(AddRequest{URL: srv.URL + "/fallback.bin", DestinationPath: dir})
	if err != nil {
		t.Fatal(err)
	}
	waitForState(t, m, d.ID, Completed)
	got, err := os.ReadFile(dir + string(os.PathSeparator) + "fallback.bin")
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != string(payload) {
		t.Fatalf("unexpected payload %q", got)
	}
}

func TestInvalidContentRangeFailsClearly(t *testing.T) {
	payload := []byte(strings.Repeat("x", 1024))
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Accept-Ranges", "bytes")
		w.Header().Set("Content-Length", strconv.Itoa(len(payload)))
		if r.Method == http.MethodHead {
			return
		}
		w.Header().Set("Content-Range", fmt.Sprintf("bytes 1-1/%d", len(payload)))
		w.WriteHeader(http.StatusPartialContent)
		_, _ = w.Write(payload[:1])
	}))
	defer srv.Close()
	dir := t.TempDir()
	m, err := NewManager(dir, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer m.Close()
	d, err := m.Add(AddRequest{URL: srv.URL + "/bad.bin", DestinationPath: dir})
	if err != nil {
		t.Fatal(err)
	}
	got := waitForState(t, m, d.ID, Error)
	if got.Error == nil || !strings.Contains(*got.Error, "incomplete") {
		t.Fatalf("expected incomplete error, got %+v", got)
	}
}

func waitForState(t *testing.T, m *Manager, id string, state DownloadState) Download {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		for _, got := range m.List() {
			if got.ID == id && got.State == state {
				return got
			}
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatalf("download %s did not reach %s: %+v", id, state, m.List())
	return Download{}
}

func TestPersistedActiveDownloadRestoresPaused(t *testing.T) {
	dir := t.TempDir()
	m, _ := NewManager(dir, nil)
	m.mu.Lock()
	m.downloads["one"] = &Download{ID: "one", URL: "https://example.test/a", Filename: "a", DestinationPath: dir, Category: "general", Kind: "http", State: Active, DateAdded: NowISO()}
	m.order = []string{"one"}
	m.mu.Unlock()
	if err := m.save(); err != nil {
		t.Fatal(err)
	}
	m.Close()
	m2, err := NewManager(dir, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer m2.Close()
	if got := m2.List(); len(got) != 1 || got[0].State != Paused {
		t.Fatalf("unexpected recovery: %+v", got)
	}
}

func TestScheduleAllowsOvernightWindow(t *testing.T) {
	s := &Schedule{Enabled: true, StartHHmm: "23:00", StopHHmm: "06:00"}
	zone := time.FixedZone("test", 0)
	if !scheduleAllows(s, time.Date(2026, 1, 1, 1, 0, 0, 0, zone)) {
		t.Fatal("01:00 should be inside overnight window")
	}
	if scheduleAllows(s, time.Date(2026, 1, 1, 12, 0, 0, 0, zone)) {
		t.Fatal("12:00 should be outside overnight window")
	}
}

func TestHTTPFailureClassificationAndRetryAfter(t *testing.T) {
	resp := &http.Response{StatusCode: http.StatusTooManyRequests, Status: "429 Too Many Requests", Header: http.Header{"Retry-After": []string{"7"}}}
	err := httpFailure(resp)
	category, status, wait, retryable := classifyDownloadError(err)
	if category != "throttled" || status != 429 || wait != 7*time.Second || !retryable {
		t.Fatalf("unexpected classification: %s %d %s %v", category, status, wait, retryable)
	}
	resp = &http.Response{StatusCode: http.StatusForbidden, Status: "403 Forbidden", Header: http.Header{}}
	category, _, _, retryable = classifyDownloadError(httpFailure(resp))
	if category != "forbidden" || retryable {
		t.Fatalf("forbidden must not retry")
	}
}

func TestSHA256Verification(t *testing.T) {
	payload := []byte("verified payload")
	sum := fmt.Sprintf("%x", sha256.Sum256(payload))
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Length", strconv.Itoa(len(payload)))
		if r.Method != http.MethodHead {
			_, _ = w.Write(payload)
		}
	}))
	defer srv.Close()
	dir := t.TempDir()
	m, err := NewManager(dir, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer m.Close()
	d, err := m.Add(AddRequest{URL: srv.URL + "/ok", DestinationPath: dir, ExpectedSHA256: sum})
	if err != nil {
		t.Fatal(err)
	}
	got := waitForState(t, m, d.ID, Completed)
	if got.ActualSHA256 != sum {
		t.Fatalf("checksum missing: %+v", got)
	}
	d, err = m.Add(AddRequest{URL: srv.URL + "/bad", DestinationPath: dir, ExpectedSHA256: strings.Repeat("0", 64)})
	if err != nil {
		t.Fatal(err)
	}
	got = waitForState(t, m, d.ID, Error)
	if got.Error == nil || !strings.Contains(*got.Error, "checksum mismatch") {
		t.Fatalf("expected checksum error: %+v", got)
	}
}

func TestHostConnectionRulesOverrideLearnedProfile(t *testing.T) {
	dir := t.TempDir()
	m, err := NewManager(dir, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer m.Close()
	m.rememberHost("https://cdn.example.test/file", true, 12)
	if got := m.connectionsForHost("https://cdn.example.test/other", 16); got != 12 {
		t.Fatalf("learned profile ignored: %d", got)
	}
	m.mu.Lock()
	m.settings.HostRules = []HostRule{{Host: "cdn.example.test", ForceSingleConnection: true}}
	m.mu.Unlock()
	if got := m.connectionsForHost("https://cdn.example.test/other", 16); got != 1 {
		t.Fatalf("explicit exception ignored: %d", got)
	}
}

func TestQueueMoveAndWeekdaySchedule(t *testing.T) {
	dir := t.TempDir()
	m, err := NewManager(dir, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer m.Close()
	m.mu.Lock()
	m.settings.Queues = append(m.settings.Queues, Queue{ID: "night", Name: "Night", Priority: 10, MaxConcurrent: 1, Running: true, Schedule: &Schedule{Enabled: true, StartHHmm: "23:00", StopHHmm: "06:00", Weekdays: []int{int(time.Thursday)}}})
	m.downloads["q"] = &Download{ID: "q", QueueID: "default"}
	m.order = []string{"q"}
	m.mu.Unlock()
	if err = m.MoveToQueue([]string{"q"}, "night"); err != nil {
		t.Fatal(err)
	}
	if got := m.List(); len(got) != 1 || got[0].QueueID != "night" {
		t.Fatalf("move failed: %+v", got)
	}
	if !scheduleAllows(&Schedule{Enabled: true, StartHHmm: "23:00", StopHHmm: "06:00", Weekdays: []int{int(time.Thursday)}}, time.Date(2026, 1, 1, 23, 30, 0, 0, time.UTC)) {
		t.Fatal("weekday queue should run")
	}
	if scheduleAllows(&Schedule{Enabled: true, StartHHmm: "23:00", StopHHmm: "06:00", Weekdays: []int{int(time.Friday)}}, time.Date(2026, 1, 1, 23, 30, 0, 0, time.UTC)) {
		t.Fatal("wrong weekday should not run")
	}
}

func TestCustomProxyAndCredentialRejection(t *testing.T) {
	proxy := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Host != "origin.invalid" {
			t.Errorf("proxy did not receive absolute target: %s", r.URL)
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	defer proxy.Close()
	dir := t.TempDir()
	m, err := NewManager(dir, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer m.Close()
	settings := m.GetSettings()
	settings.ProxyURL = proxy.URL
	settings.UseSystemProxy = false
	if err = m.UpdateSettings(settings); err != nil {
		t.Fatal(err)
	}
	req, _ := http.NewRequest(http.MethodGet, "http://origin.invalid/test", nil)
	resp, err := m.doHTTP(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("proxy status %d", resp.StatusCode)
	}
	settings.ProxyURL = "http://user:secret@proxy.test"
	if err = m.UpdateSettings(settings); err == nil {
		t.Fatal("embedded proxy credentials must be rejected")
	}
}

func TestSessionBasicAuthenticationIsNotPersisted(t *testing.T) {
	payload := []byte("private")
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		u, p, ok := r.BasicAuth()
		if !ok || u != "alice" || p != "secret" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		w.Header().Set("Content-Length", strconv.Itoa(len(payload)))
		if r.Method != http.MethodHead {
			_, _ = w.Write(payload)
		}
	}))
	defer srv.Close()
	dir := t.TempDir()
	m, err := NewManager(dir, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer m.Close()
	d, err := m.Add(AddRequest{URL: srv.URL + "/private", DestinationPath: dir, AuthScheme: "basic", AuthUsername: "alice", AuthSecret: "secret"})
	if err != nil {
		t.Fatal(err)
	}
	waitForState(t, m, d.ID, Completed)
	var stored string
	if err = m.db.QueryRow(`SELECT payload FROM downloads WHERE id=?`, d.ID).Scan(&stored); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(stored, "secret") {
		t.Fatalf("credential leaked into SQLite: %s", stored)
	}
}

func TestBrowserCookieHandoffIsSessionOnly(t *testing.T) {
	payload := []byte("browser protected file")
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Cookie") != "session=browser-secret" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		w.Header().Set("Content-Length", strconv.Itoa(len(payload)))
		if r.Method != http.MethodHead {
			_, _ = w.Write(payload)
		}
	}))
	defer srv.Close()
	dir := t.TempDir()
	m, err := NewManager(dir, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer m.Close()
	d, err := m.Add(AddRequest{URL: srv.URL + "/protected", DestinationPath: dir, CookieHeader: "session=browser-secret"})
	if err != nil {
		t.Fatal(err)
	}
	waitForState(t, m, d.ID, Completed)
	var stored string
	if err = m.db.QueryRow(`SELECT payload FROM downloads WHERE id=?`, d.ID).Scan(&stored); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(stored, "browser-secret") {
		t.Fatalf("browser cookie leaked into SQLite: %s", stored)
	}
}
