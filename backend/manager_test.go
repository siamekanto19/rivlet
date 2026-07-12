package backend

import (
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
