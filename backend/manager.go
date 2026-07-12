package backend

import (
	"context"
	"crypto/sha256"
	"crypto/tls"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"net/http/httptrace"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

type EventSink func(string, any)
type persisted struct {
	Downloads []*Download       `json:"downloads"`
	Settings  Settings          `json:"settings"`
	Limits    map[string]*int64 `json:"limits,omitempty"`
}
type Manager struct {
	mu          sync.RWMutex
	downloads   map[string]*Download
	order       []string
	settings    Settings
	limits      map[string]*int64
	cancels     map[string]context.CancelFunc
	authSecrets map[string]string
	statePath   string
	db          *sql.DB
	dbPath      string
	client      *http.Client
	clientMu    sync.RWMutex
	emit        EventSink
	wake        chan struct{}
	closed      chan struct{}
}

func NewManager(stateDir string, emit EventSink) (*Manager, error) {
	if stateDir == "" {
		var err error
		stateDir, err = os.UserConfigDir()
		if err != nil {
			return nil, err
		}
		stateDir = filepath.Join(stateDir, "Grabby")
	}
	if err := os.MkdirAll(stateDir, 0755); err != nil {
		return nil, err
	}
	dl, _ := os.UserHomeDir()
	dl = filepath.Join(dl, "Downloads")
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.MaxIdleConns = 128
	transport.MaxIdleConnsPerHost = 32
	transport.MaxConnsPerHost = 32
	transport.ForceAttemptHTTP2 = true
	m := &Manager{downloads: map[string]*Download{}, limits: map[string]*int64{}, cancels: map[string]context.CancelFunc{}, authSecrets: map[string]string{}, statePath: filepath.Join(stateDir, "state.json"), client: &http.Client{Transport: transport}, emit: emit, wake: make(chan struct{}, 1), closed: make(chan struct{})}
	m.settings = defaultSettings(dl)
	m.normalizeSettings()
	if err := m.openStore(filepath.Join(stateDir, "grabify.db")); err != nil {
		return nil, err
	}
	if err := m.load(); err != nil {
		m.db.Close()
		return nil, err
	}
	if err := m.configureHTTPClient(); err != nil {
		m.db.Close()
		return nil, err
	}
	go m.scheduler()
	go m.progressEmitter()
	return m, nil
}
func defaultSettings(dl string) Settings {
	return Settings{
		DownloadDir: dl, MaxConcurrent: 4, UseSystemProxy: true,
		NotifyOnComplete: true, AutoResumeOnStartup: false,
		SegmentCount: 16, RetryCount: 3, RetryDelaySeconds: 5,
		RequestTimeoutSeconds: 30, UserAgent: "Grabify/1.0", OverwritePolicy: "rename",
		VideoDetectionEnabled: true, PreferredVideoQuality: "best", PreferredVideoContainer: "mp4", ConcurrentFragments: 4,
		Queues: []Queue{{ID: "default", Name: "Downloads", MaxConcurrent: 4, Running: true, Schedule: &Schedule{StartHHmm: "01:00", StopHHmm: "08:00", Weekdays: []int{0, 1, 2, 3, 4, 5, 6}, Repeat: true}}},
		Categories: []Category{
			{ID: "general", Name: "General", Folder: dl, Extensions: []string{}},
			{ID: "video", Name: "Video", Folder: filepath.Join(dl, "Video"), Extensions: []string{"mp4", "mkv", "webm", "mov"}},
			{ID: "music", Name: "Music", Folder: filepath.Join(dl, "Music"), Extensions: []string{"mp3", "m4a", "flac", "wav"}},
			{ID: "documents", Name: "Documents", Folder: filepath.Join(dl, "Documents"), Extensions: []string{"pdf", "doc", "docx", "zip"}},
		},
	}
}
func (m *Manager) Close() {
	close(m.closed)
	m.mu.Lock()
	for _, c := range m.cancels {
		c()
	}
	m.mu.Unlock()
	_ = m.save()
	_ = m.backupStore()
	if m.db != nil {
		_ = m.db.Close()
	}
}
func (m *Manager) signal() {
	select {
	case m.wake <- struct{}{}:
	default:
	}
}
func clone[T any](v T) T { b, _ := json.Marshal(v); var out T; _ = json.Unmarshal(b, &out); return out }
func (m *Manager) List() []Download {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]Download, 0, len(m.order))
	for _, id := range m.order {
		if d := m.downloads[id]; d != nil {
			out = append(out, clone(*d))
		}
	}
	return out
}
func (m *Manager) GetSettings() Settings {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return clone(m.settings)
}
func (m *Manager) NeedsBrowserOnboarding() bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return !m.settings.BrowserOnboardingCompleted || m.settings.ShowBrowserOnboardingOnStartup
}
func (m *Manager) CompleteBrowserOnboarding() error {
	m.mu.Lock()
	m.settings.BrowserOnboardingCompleted = true
	m.settings.ShowBrowserOnboardingOnStartup = false
	m.mu.Unlock()
	return m.save()
}
func (m *Manager) Add(r AddRequest) (Download, error) {
	if r.Kind == "" {
		r.Kind = "http"
	}
	if r.Kind == "torrent" {
		// Torrents carry a magnet URI or a .torrent file path, neither of which
		// is an http(s) URL — skip the web-URL validation and derive a name.
		if strings.TrimSpace(r.URL) == "" {
			return Download{}, errors.New("no magnet link or torrent file provided")
		}
		if r.Filename == "" {
			r.Filename = torrentDisplayName(r.URL)
		}
	} else {
		u, err := url.Parse(r.URL)
		if err != nil || u.Scheme == "" {
			return Download{}, errors.New("invalid download URL")
		}
		if r.Filename == "" {
			r.Filename = filepath.Base(strings.TrimSuffix(u.Path, "/"))
			if r.Filename == "" || r.Filename == "." {
				r.Filename = "download"
			}
		}
	}
	r.Filename = safeName(r.Filename)
	m.mu.Lock()
	if r.Category == "" {
		r.Category = m.category(r.Filename)
	}
	if r.DestinationPath == "" {
		r.DestinationPath = m.folder(r.Category)
	}
	id := fmt.Sprintf("dl-%d", time.Now().UnixNano())
	credentialTarget := ""
	if r.AuthSecret != "" && r.RememberCredential {
		credentialTarget = "Grabify/http/" + safeHost(r.URL) + "/" + r.AuthUsername
		if err := storeCredential(credentialTarget, r.AuthUsername, r.AuthSecret); err != nil {
			m.mu.Unlock()
			return Download{}, err
		}
	}
	expectedHash := strings.ToLower(strings.TrimSpace(r.ExpectedSHA256))
	if expectedHash != "" {
		if len(expectedHash) != 64 {
			m.mu.Unlock()
			return Download{}, errors.New("SHA-256 must contain exactly 64 hexadecimal characters")
		}
		if _, err := hex.DecodeString(expectedHash); err != nil {
			m.mu.Unlock()
			return Download{}, errors.New("SHA-256 contains non-hexadecimal characters")
		}
	}
	queueID := r.QueueID
	if queueID == "" {
		queueID = "default"
	}
	d := &Download{ID: id, URL: r.URL, Filename: r.Filename, DestinationPath: r.DestinationPath, Category: r.Category, Kind: r.Kind, State: Queued, DateAdded: NowISO(), Referrer: r.Referrer, RequestUserAgent: r.UserAgent, VideoFormatID: r.VideoFormatID, BrowserProfile: r.BrowserProfile, Browser: r.Browser, ExpectedSHA256: expectedHash, QueueID: queueID, Priority: r.Priority, AuthScheme: strings.ToLower(r.AuthScheme), AuthUsername: r.AuthUsername, CredentialTarget: credentialTarget}
	if r.AuthSecret != "" && !r.RememberCredential {
		m.authSecrets[id] = r.AuthSecret
	}
	m.downloads[id] = d
	m.order = append([]string{id}, m.order...)
	out := clone(*d)
	m.mu.Unlock()
	_ = m.save()
	m.emitEvent("added", out)
	m.signal()
	return out, nil
}
func safeName(s string) string {
	s = filepath.Base(strings.TrimSpace(s))
	return strings.Map(func(r rune) rune {
		if strings.ContainsRune(`<>:"/\\|?*`, r) || r < 32 {
			return '_'
		}
		return r
	}, s)
}
func (m *Manager) category(name string) string {
	ext := strings.TrimPrefix(strings.ToLower(filepath.Ext(name)), ".")
	for _, c := range m.settings.Categories {
		for _, x := range c.Extensions {
			if strings.EqualFold(ext, x) {
				return c.ID
			}
		}
	}
	return "general"
}
func (m *Manager) folder(id string) string {
	for _, c := range m.settings.Categories {
		if c.ID == id && c.Folder != "" {
			return c.Folder
		}
	}
	return m.settings.DownloadDir
}
func (m *Manager) scheduler() {
	for {
		select {
		case <-m.wake:
		case <-time.After(time.Second):
		case <-m.closed:
			return
		}
		m.mu.Lock()
		running := len(m.cancels)
		globalMax := m.settings.MaxConcurrent
		if globalMax < 1 {
			globalMax = 1
		}
		allowed := scheduleAllows(m.settings.Schedule, time.Now())
		queueRunning := map[string]int{}
		for id := range m.cancels {
			if d := m.downloads[id]; d != nil {
				queueRunning[d.QueueID]++
			}
		}
		candidates := append([]string(nil), m.order...)
		sort.SliceStable(candidates, func(i, j int) bool {
			a, b := m.downloads[candidates[i]], m.downloads[candidates[j]]
			if a == nil || b == nil {
				return false
			}
			qa, qb := m.queuePriority(a.QueueID), m.queuePriority(b.QueueID)
			if qa != qb {
				return qa > qb
			}
			return a.Priority > b.Priority
		})
		for _, id := range candidates {
			if !allowed {
				break
			}
			if running >= globalMax {
				break
			}
			d := m.downloads[id]
			q, queueOK := m.queueConfig(d)
			if d != nil && d.State == Queued && queueOK && q.Running && scheduleAllows(q.Schedule, time.Now()) && queueRunning[q.ID] < max(q.MaxConcurrent, 1) {
				ctx, cancel := context.WithCancel(context.Background())
				m.cancels[id] = cancel
				d.State = Connecting
				running++
				queueRunning[q.ID]++
				go m.run(ctx, id)
			}
		}
		m.mu.Unlock()
	}
}

func (m *Manager) queueConfig(d *Download) (Queue, bool) {
	if d == nil {
		return Queue{}, false
	}
	id := d.QueueID
	if id == "" {
		id = "default"
	}
	for _, q := range m.settings.Queues {
		if q.ID == id {
			return q, true
		}
	}
	return Queue{}, false
}
func (m *Manager) queuePriority(id string) int {
	for _, q := range m.settings.Queues {
		if q.ID == id {
			return q.Priority
		}
	}
	return 0
}

func scheduleAllows(s *Schedule, now time.Time) bool {
	if s == nil || !s.Enabled {
		return true
	}
	if len(s.Weekdays) > 0 {
		matched := false
		for _, day := range s.Weekdays {
			if day == int(now.Weekday()) {
				matched = true
				break
			}
		}
		if !matched {
			return false
		}
	}
	parse := func(v string) (int, bool) {
		parts := strings.Split(v, ":")
		if len(parts) != 2 {
			return 0, false
		}
		h, e1 := strconv.Atoi(parts[0])
		min, e2 := strconv.Atoi(parts[1])
		return h*60 + min, e1 == nil && e2 == nil && h >= 0 && h < 24 && min >= 0 && min < 60
	}
	start, ok1 := parse(s.StartHHmm)
	stop, ok2 := parse(s.StopHHmm)
	if !ok1 || !ok2 {
		return true
	}
	current := now.Hour()*60 + now.Minute()
	if start == stop {
		return true
	}
	if start < stop {
		return current >= start && current < stop
	}
	return current >= start || current < stop
}
func (m *Manager) run(ctx context.Context, id string) {
	m.mu.RLock()
	retries, delay := m.settings.RetryCount, m.settings.RetryDelaySeconds
	m.mu.RUnlock()
	var err error
	for attempt := 0; attempt <= retries; attempt++ {
		m.mu.RLock()
		kind := m.downloads[id].Kind
		m.mu.RUnlock()
		if kind == "video" {
			err = m.downloadVideo(ctx, id)
		} else if kind == "torrent" {
			err = m.downloadTorrent(ctx, id)
		} else {
			err = m.downloadHTTP(ctx, id)
		}
		if err == nil || errors.Is(err, context.Canceled) || attempt == retries {
			break
		}
		category, status, retryAfter, retryable := classifyDownloadError(err)
		m.recordRetry(id, category, status, err.Error())
		if !retryable {
			break
		}
		backoff := time.Duration(delay) * time.Second * time.Duration(1<<min(attempt, 6))
		if retryAfter > backoff {
			backoff = retryAfter
		}
		backoff += time.Duration(rand.Int63n(max64(int64(backoff/4), 1)))
		select {
		case <-time.After(backoff):
		case <-ctx.Done():
			err = ctx.Err()
			break
		}
	}
	m.mu.Lock()
	delete(m.cancels, id)
	d := m.downloads[id]
	if d != nil {
		if err == nil {
			d.State = Completed
			if d.Kind == "video" {
				d.ProcessingStage = "complete"
			}
			now := NowISO()
			d.DateCompleted = &now
			d.SpeedBps = 0
		} else if !errors.Is(err, context.Canceled) && d.State != Paused && d.State != Canceled {
			d.State = Error
			s := err.Error()
			d.Error = &s
			d.ErrorCategory, _, _, _ = classifyDownloadError(err)
			m.recordDiagnostic("error", "download", "failed", fmt.Sprintf("id=%s category=%s message=%s", id, d.ErrorCategory, s))
			d.SpeedBps = 0
		}
		snap := clone(*d)
		action, remove := m.completionPolicyLocked(d)
		m.mu.Unlock()
		m.emitEvent("stateChange", snap)
		if remove {
			m.mu.Lock()
			delete(m.downloads, id)
			m.order = removeString(m.order, id)
			m.mu.Unlock()
			m.emitEvent("removed", id)
		}
		if action != "" {
			go func() { _ = systemPowerAction(action) }()
		}
	} else {
		m.mu.Unlock()
	}
	_ = m.save()
	m.signal()
}
func removeString(values []string, want string) []string {
	out := values[:0]
	for _, v := range values {
		if v != want {
			out = append(out, v)
		}
	}
	return out
}
func (m *Manager) completionPolicyLocked(completed *Download) (string, bool) {
	if completed.State != Completed {
		return "", false
	}
	remove := m.settings.RemoveCompleted
	queueID := completed.QueueID
	if queueID == "" {
		queueID = "default"
	}
	for _, d := range m.downloads {
		if d.ID != completed.ID && (d.QueueID == queueID || (d.QueueID == "" && queueID == "default")) && !isTerminal(d.State) {
			return "", remove
		}
	}
	for _, q := range m.settings.Queues {
		if q.ID == queueID && q.CompletionAction != "" {
			return q.CompletionAction, remove
		}
	}
	if m.settings.ShutdownOnComplete {
		for _, d := range m.downloads {
			if d.ID != completed.ID && !isTerminal(d.State) {
				return "", remove
			}
		}
		return "shutdown", remove
	}
	return "", remove
}
func isTerminal(s DownloadState) bool { return s == Completed || s == Canceled || s == Error }

type downloadError struct {
	Category   string
	Status     int
	Message    string
	RetryAfter time.Duration
	Retryable  bool
}

func (e *downloadError) Error() string { return e.Message }
func httpFailure(resp *http.Response) error {
	category, retryable := "server", resp.StatusCode >= 500
	switch resp.StatusCode {
	case 401:
		category = "unauthorized"
		retryable = false
	case 403:
		category = "forbidden"
		retryable = false
	case 404, 410:
		category = "missing"
		retryable = false
	case 408:
		category = "expired"
		retryable = true
	case 429:
		category = "throttled"
		retryable = true
	}
	return &downloadError{Category: category, Status: resp.StatusCode, Message: fmt.Sprintf("%s: server returned %s", strings.Title(category), resp.Status), RetryAfter: parseRetryAfter(resp.Header.Get("Retry-After")), Retryable: retryable}
}
func parseRetryAfter(v string) time.Duration {
	if seconds, err := strconv.Atoi(strings.TrimSpace(v)); err == nil && seconds > 0 {
		return time.Duration(seconds) * time.Second
	}
	if when, err := http.ParseTime(v); err == nil {
		return max(when.Sub(time.Now()), 0)
	}
	return 0
}
func classifyDownloadError(err error) (string, int, time.Duration, bool) {
	var e *downloadError
	if errors.As(err, &e) {
		return e.Category, e.Status, e.RetryAfter, e.Retryable
	}
	return "network", 0, 0, true
}
func (m *Manager) recordRetry(id, category string, status int, message string) {
	if m.db == nil {
		return
	}
	_, _ = m.db.Exec(`INSERT INTO retry_history(download_id,attempted_at,category,status_code,message) VALUES(?,?,?,?,?)`, id, NowISO(), category, status, message)
}
func (m *Manager) downloadHTTP(ctx context.Context, id string) error {
	m.mu.RLock()
	d := clone(*m.downloads[id])
	m.mu.RUnlock()
	if d.Kind != "http" {
		return fmt.Errorf("%s downloads require an external integration", d.Kind)
	}
	m.mu.RLock()
	timeout, segmentCount, userAgent := m.settings.RequestTimeoutSeconds, m.settings.SegmentCount, m.settings.UserAgent
	m.mu.RUnlock()
	if d.RequestUserAgent != "" {
		userAgent = d.RequestUserAgent
	}
	probeCtx, cancelProbe := context.WithTimeout(ctx, time.Duration(timeout)*time.Second)
	defer cancelProbe()
	size, ranges, etag, lastModified, err := m.inspectHTTP(probeCtx, d, userAgent)
	if err != nil {
		return err
	}
	m.mu.Lock()
	live := m.downloads[id]
	if !loadMeta(m.metaPath(live), live) {
		loadMeta(filepath.Join(live.DestinationPath, live.Filename)+".meta", live)
	}
	if live.DownloadedBytes > 0 && ((live.ETag != "" && etag != "" && live.ETag != etag) ||
		(live.LastModified != "" && lastModified != "" && live.LastModified != lastModified)) {
		m.mu.Unlock()
		return fmt.Errorf("remote file changed since the download was paused; restart the download")
	}
	live.SupportsResume = ranges
	live.ETag, live.LastModified = etag, lastModified
	if size >= 0 {
		live.SizeBytes = &size
	}
	if ranges {
		live.Segments = makeWorkSegments(size, adaptiveSegmentCount(size, segmentCount))
	} else {
		live.Segments = []SegmentProgress{{Index: 0, From: 0, To: max64(size-1, 0)}}
	}
	live.State = Active
	m.mu.Unlock()
	m.emitState(id)
	if err := os.MkdirAll(d.DestinationPath, 0755); err != nil {
		return err
	}
	path := filepath.Join(d.DestinationPath, d.Filename)
	m.mu.RLock()
	policy := m.settings.OverwritePolicy
	resumedBytes := m.downloads[id].DownloadedBytes
	m.mu.RUnlock()
	if _, statErr := os.Stat(path); statErr == nil && resumedBytes == 0 {
		switch policy {
		case "skip":
			return fmt.Errorf("file already exists: %s", path)
		case "overwrite":
			if err := os.Remove(path); err != nil {
				return err
			}
		default:
			ext, base := filepath.Ext(d.Filename), strings.TrimSuffix(d.Filename, filepath.Ext(d.Filename))
			for i := 1; ; i++ {
				candidate := fmt.Sprintf("%s (%d)%s", base, i, ext)
				candidatePath := filepath.Join(d.DestinationPath, candidate)
				if _, err := os.Stat(candidatePath); os.IsNotExist(err) {
					d.Filename, path = candidate, candidatePath
					m.mu.Lock()
					m.downloads[id].Filename = candidate
					m.mu.Unlock()
					break
				}
			}
		}
	}
	f, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0644)
	if err != nil {
		return err
	}
	defer f.Close()
	if size > 0 {
		_ = f.Truncate(size)
	}
	m.mu.RLock()
	segs := clone(m.downloads[id].Segments)
	m.mu.RUnlock()
	workers := 1
	if ranges {
		workers = m.connectionsForHost(d.URL, adaptiveSegmentCount(size, segmentCount))
	}
	jobs := make(chan SegmentProgress, len(segs))
	errs := make(chan error, workers)
	workCtx, cancelWork := context.WithCancel(ctx)
	defer cancelWork()
	for _, seg := range segs {
		if seg.Done < seg.To-seg.From+1 {
			jobs <- seg
		}
	}
	close(jobs)
	var wg sync.WaitGroup
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for s := range jobs {
				if e := m.fetchSegment(workCtx, id, f, s, ranges); e != nil {
					select {
					case errs <- e:
					default:
					}
					cancelWork()
					return
				}
			}
		}()
	}
	wg.Wait()
	close(errs)
	for e := range errs {
		if e != nil {
			return e
		}
	}
	if size >= 0 {
		info, statErr := f.Stat()
		if statErr != nil {
			return statErr
		}
		if info.Size() != size || m.downloadedFor(id) != size {
			return &downloadError{Category: "integrity", Message: fmt.Sprintf("download incomplete: expected %d bytes, received %d", size, m.downloadedFor(id)), Retryable: false}
		}
	}
	if live.ExpectedSHA256 != "" {
		if err := f.Sync(); err != nil {
			return err
		}
		if _, err := f.Seek(0, io.SeekStart); err != nil {
			return err
		}
		h := sha256.New()
		if _, err = io.Copy(h, f); err != nil {
			return err
		}
		actual := fmt.Sprintf("%x", h.Sum(nil))
		m.mu.Lock()
		m.downloads[id].ActualSHA256 = actual
		m.mu.Unlock()
		if actual != live.ExpectedSHA256 {
			return &downloadError{Category: "integrity", Message: fmt.Sprintf("checksum mismatch: expected SHA-256 %s, received %s", live.ExpectedSHA256, actual), Retryable: false}
		}
	}
	_ = os.Remove(m.metaPath(live))
	_ = os.Remove(path + ".meta")
	return nil
}

// inspectHTTP validates the remote before workers touch the destination file.
// A one-byte ranged GET handles servers that reject HEAD and also verifies that
// an advertised byte-range capability is real.
func (m *Manager) inspectHTTP(ctx context.Context, d Download, userAgent string) (int64, bool, string, string, error) {
	request := func(method string, ranged bool) (*http.Response, error) {
		req, err := http.NewRequestWithContext(ctx, method, d.URL, nil)
		if err != nil {
			return nil, err
		}
		if userAgent != "" {
			req.Header.Set("User-Agent", userAgent)
		}
		if d.Referrer != "" {
			req.Header.Set("Referer", d.Referrer)
		}
		if err := m.applyAuthentication(req, d); err != nil {
			return nil, err
		}
		if ranged {
			req.Header.Set("Range", "bytes=0-0")
		}
		return m.doHTTP(req)
	}
	resp, err := request(http.MethodHead, false)
	if err == nil && resp.StatusCode >= 200 && resp.StatusCode < 400 {
		resp.Body.Close()
		size := resp.ContentLength
		etag, modified := resp.Header.Get("ETag"), resp.Header.Get("Last-Modified")
		if size > 0 && strings.Contains(strings.ToLower(resp.Header.Get("Accept-Ranges")), "bytes") {
			probe, probeErr := request(http.MethodGet, true)
			if probeErr == nil {
				defer probe.Body.Close()
				if total, ok := validContentRange(probe.Header.Get("Content-Range"), 0, 0); probe.StatusCode == http.StatusPartialContent && ok && total == size {
					m.rememberHost(d.URL, true, m.configuredSegments())
					return size, true, firstNonEmpty(probe.Header.Get("ETag"), etag), firstNonEmpty(probe.Header.Get("Last-Modified"), modified), nil
				}
			}
		}
		m.rememberHost(d.URL, false, 1)
		return size, false, etag, modified, nil
	}
	if resp != nil {
		resp.Body.Close()
	}
	probe, err := request(http.MethodGet, true)
	if err != nil {
		return 0, false, "", "", err
	}
	defer probe.Body.Close()
	if probe.StatusCode == http.StatusPartialContent {
		if total, ok := validContentRange(probe.Header.Get("Content-Range"), 0, 0); ok {
			m.rememberHost(d.URL, true, m.configuredSegments())
			return total, true, probe.Header.Get("ETag"), probe.Header.Get("Last-Modified"), nil
		}
		return 0, false, "", "", &downloadError{Category: "range", Message: "server returned an invalid Content-Range", Retryable: false}
	}
	if probe.StatusCode/100 == 2 {
		m.rememberHost(d.URL, false, 1)
		return probe.ContentLength, false, probe.Header.Get("ETag"), probe.Header.Get("Last-Modified"), nil
	}
	return 0, false, "", "", httpFailure(probe)
}

func (m *Manager) connectionsForHost(rawURL string, fallback int) int {
	u, err := url.Parse(rawURL)
	if err != nil {
		return fallback
	}
	host := strings.ToLower(u.Hostname())
	m.mu.RLock()
	for _, rule := range m.settings.HostRules {
		if strings.EqualFold(rule.Host, host) {
			m.mu.RUnlock()
			if rule.ForceSingleConnection {
				return 1
			}
			if rule.MaxConnections > 0 {
				return min(rule.MaxConnections, fallback)
			}
			return fallback
		}
	}
	m.mu.RUnlock()
	var maxConnections int
	var reliable int
	if m.db != nil && m.db.QueryRow(`SELECT max_connections,ranges_reliable FROM host_profiles WHERE host=?`, host).Scan(&maxConnections, &reliable) == nil {
		if reliable == 0 {
			return 1
		}
		if maxConnections > 0 {
			return min(maxConnections, fallback)
		}
	}
	return fallback
}
func (m *Manager) rememberHost(rawURL string, reliable bool, maxConnections int) {
	u, err := url.Parse(rawURL)
	if err != nil || m.db == nil {
		return
	}
	value := 0
	if reliable {
		value = 1
	}
	_, _ = m.db.Exec(`INSERT INTO host_profiles(host,max_connections,ranges_reliable,updated_at) VALUES(?,?,?,?) ON CONFLICT(host) DO UPDATE SET max_connections=excluded.max_connections,ranges_reliable=excluded.ranges_reliable,updated_at=excluded.updated_at`, strings.ToLower(u.Hostname()), max(maxConnections, 1), value, NowISO())
}
func (m *Manager) configuredSegments() int {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return max(m.settings.SegmentCount, 1)
}

func validContentRange(value string, wantStart, wantEnd int64) (int64, bool) {
	var start, end, total int64
	if _, err := fmt.Sscanf(value, "bytes %d-%d/%d", &start, &end, &total); err != nil {
		return 0, false
	}
	return total, start == wantStart && end == wantEnd && total > end
}
func firstNonEmpty(a, b string) string {
	if a != "" {
		return a
	}
	return b
}
func (m *Manager) downloadedFor(id string) int64 {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if d := m.downloads[id]; d != nil {
		return d.DownloadedBytes
	}
	return 0
}
func makeSegments(size int64, n int) []SegmentProgress {
	if size <= 0 {
		return []SegmentProgress{{Index: 0}}
	}
	if size < int64(n) {
		n = 1
	}
	out := make([]SegmentProgress, n)
	for i := 0; i < n; i++ {
		from := int64(i) * size / int64(n)
		to := int64(i+1)*size/int64(n) - 1
		out[i] = SegmentProgress{Index: i, From: from, To: to}
	}
	return out
}

// makeWorkSegments deliberately creates more resumable ranges than active
// connections. The worker pool claims them as connections become idle, so a
// slow range no longer leaves completed connections unused.
func makeWorkSegments(size int64, workers int) []SegmentProgress {
	if size <= 0 {
		return makeSegments(size, 1)
	}
	if size < 4*1024*1024 {
		return makeSegments(size, 1)
	}
	const targetChunk = int64(8 * 1024 * 1024)
	jobs := int((size + targetChunk - 1) / targetChunk)
	minimum := workers * 4
	if jobs < minimum {
		jobs = minimum
	}
	if jobs > 4096 {
		jobs = 4096
	}
	if int64(jobs) > size {
		jobs = int(size)
	}
	return makeSegments(size, jobs)
}

func adaptiveSegmentCount(size int64, configured int) int {
	if configured < 1 {
		configured = 1
	}
	const minimumSegmentSize = int64(4 * 1024 * 1024)
	bySize := int((size + minimumSegmentSize - 1) / minimumSegmentSize)
	if bySize < 1 {
		bySize = 1
	}
	if bySize < configured {
		return bySize
	}
	return configured
}
func (m *Manager) fetchSegment(ctx context.Context, id string, f *os.File, s SegmentProgress, ranged bool) error {
	start := s.From + s.Done
	requestStarted := time.Now()
	var dnsStarted, tlsStarted time.Time
	var dnsMillis, tlsMillis, ttfbMillis int64
	reused := false
	trace := &httptrace.ClientTrace{DNSStart: func(httptrace.DNSStartInfo) { dnsStarted = time.Now() }, DNSDone: func(httptrace.DNSDoneInfo) {
		if !dnsStarted.IsZero() {
			dnsMillis = time.Since(dnsStarted).Milliseconds()
		}
	}, TLSHandshakeStart: func() { tlsStarted = time.Now() }, TLSHandshakeDone: func(tls.ConnectionState, error) {
		if !tlsStarted.IsZero() {
			tlsMillis = time.Since(tlsStarted).Milliseconds()
		}
	}, GotConn: func(info httptrace.GotConnInfo) { reused = info.Reused }, GotFirstResponseByte: func() { ttfbMillis = time.Since(requestStarted).Milliseconds() }}
	ctx = httptrace.WithClientTrace(ctx, trace)
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, m.urlFor(id), nil)
	m.mu.RLock()
	userAgent := m.settings.UserAgent
	download := m.downloads[id]
	m.mu.RUnlock()
	if download != nil && download.RequestUserAgent != "" {
		userAgent = download.RequestUserAgent
	}
	if userAgent != "" {
		req.Header.Set("User-Agent", userAgent)
	}
	if download != nil && download.Referrer != "" {
		req.Header.Set("Referer", download.Referrer)
	}
	if download != nil {
		if err := m.applyAuthentication(req, clone(*download)); err != nil {
			return err
		}
	}
	if ranged {
		req.Header.Set("Range", fmt.Sprintf("bytes=%d-%d", start, s.To))
		if download != nil {
			if download.ETag != "" {
				req.Header.Set("If-Range", download.ETag)
			} else if download.LastModified != "" {
				req.Header.Set("If-Range", download.LastModified)
			}
		}
	}
	resp, err := m.doHTTP(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	m.mu.Lock()
	if d := m.downloads[id]; d != nil {
		d.HTTPVersion = resp.Proto
		if d.DNSMillis == 0 {
			d.DNSMillis = dnsMillis
		}
		if d.TLSMillis == 0 {
			d.TLSMillis = tlsMillis
		}
		if d.TTFBMillis == 0 || ttfbMillis < d.TTFBMillis {
			d.TTFBMillis = ttfbMillis
		}
		if reused {
			d.ReusedConnections++
		} else {
			d.NewConnections++
		}
	}
	m.mu.Unlock()
	if ranged && resp.StatusCode != http.StatusPartialContent {
		if resp.StatusCode == http.StatusRequestedRangeNotSatisfiable {
			return fmt.Errorf("server rejected the saved resume position (HTTP 416); restart the download")
		}
		return httpFailure(resp)
	}
	if ranged {
		if _, ok := validContentRange(resp.Header.Get("Content-Range"), start, s.To); !ok {
			return &downloadError{Category: "range", Message: fmt.Sprintf("server returned an invalid Content-Range for bytes %d-%d", start, s.To), Retryable: false}
		}
	}
	if !ranged && resp.StatusCode/100 != 2 {
		return httpFailure(resp)
	}
	buf := make([]byte, 512*1024)
	off := start
	for {
		n, e := resp.Body.Read(buf)
		if n > 0 {
			if err := m.throttle(ctx, id, n); err != nil {
				return err
			}
			if _, err = f.WriteAt(buf[:n], off); err != nil {
				return err
			}
			off += int64(n)
			m.addProgress(id, s.Index, int64(n))
		}
		if e == io.EOF {
			if s.To >= s.From && off != s.To+1 {
				return &downloadError{Category: "integrity", Message: fmt.Sprintf("download incomplete: expected segment through byte %d, received through byte %d", s.To, off-1), Retryable: false}
			}
			return nil
		}
		if errors.Is(e, io.ErrUnexpectedEOF) {
			return &downloadError{Category: "integrity", Message: fmt.Sprintf("download incomplete: expected segment through byte %d, received through byte %d", s.To, off-1), Retryable: false}
		}
		if e != nil {
			return e
		}
	}
}
func (m *Manager) applyAuthentication(req *http.Request, d Download) error {
	if d.AuthScheme == "" {
		return nil
	}
	m.mu.RLock()
	secret := m.authSecrets[d.ID]
	m.mu.RUnlock()
	user := d.AuthUsername
	if secret == "" && d.CredentialTarget != "" {
		storedUser, storedSecret, err := readCredential(d.CredentialTarget)
		if err != nil {
			return fmt.Errorf("authentication credential unavailable: %w", err)
		}
		if user == "" {
			user = storedUser
		}
		secret = storedSecret
	}
	if secret == "" {
		return errors.New("authentication is required but no credential is available")
	}
	switch strings.ToLower(d.AuthScheme) {
	case "basic":
		req.SetBasicAuth(user, secret)
	case "bearer":
		req.Header.Set("Authorization", "Bearer "+secret)
	default:
		return fmt.Errorf("unsupported authentication scheme %q", d.AuthScheme)
	}
	return nil
}
func (m *Manager) urlFor(id string) string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.downloads[id].URL
}
func (m *Manager) throttle(ctx context.Context, id string, n int) error {
	m.mu.RLock()
	lim := m.settings.GlobalSpeedLimitBps
	if d := m.downloads[id]; d != nil {
		if q, ok := m.queueConfig(d); ok && q.SpeedLimitBps != nil && (lim == nil || *q.SpeedLimitBps < *lim) {
			lim = q.SpeedLimitBps
		}
	}
	if x, ok := m.limits[id]; ok && x != nil && (lim == nil || *x < *lim) {
		lim = x
	}
	m.mu.RUnlock()
	if lim == nil || *lim <= 0 {
		return nil
	}
	delay := time.Duration(float64(time.Second) * float64(n) / float64(*lim))
	select {
	case <-time.After(delay):
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}
func (m *Manager) addProgress(id string, idx int, n int64) {
	m.mu.Lock()
	defer m.mu.Unlock()
	d := m.downloads[id]
	if d == nil {
		return
	}
	d.Segments[idx].Done += n
	d.DownloadedBytes += n
	if d.SizeBytes != nil && *d.SizeBytes > 0 {
		d.ProgressPct = float64(d.DownloadedBytes) * 100 / float64(*d.SizeBytes)
	}
}
func (m *Manager) progressEmitter() {
	t := time.NewTicker(250 * time.Millisecond)
	defer t.Stop()
	last := map[string]int64{}
	for {
		select {
		case <-t.C:
			m.mu.Lock()
			updates := []Download{}
			for id, d := range m.downloads {
				if d.State == Active {
					prev := last[id]
					delta := d.DownloadedBytes - prev
					last[id] = d.DownloadedBytes
					d.SpeedBps = delta * 4
					if d.SizeBytes != nil && d.SpeedBps > 0 {
						v := (*d.SizeBytes - d.DownloadedBytes) / d.SpeedBps
						d.ETASeconds = &v
					}
					updates = append(updates, clone(*d))
					_ = saveMeta(m.metaPath(d), d)
				}
			}
			m.mu.Unlock()
			if len(updates) > 0 {
				m.emitEvent("progress", updates)
			}
		case <-m.closed:
			return
		}
	}
}
func (m *Manager) Pause(id string) {
	m.mu.Lock()
	if c := m.cancels[id]; c != nil {
		c()
	}
	if d := m.downloads[id]; d != nil && (d.State == Active || d.State == Connecting || d.State == Queued) {
		d.State = Paused
		d.SpeedBps = 0
	}
	m.mu.Unlock()
	m.emitState(id)
	_ = m.save()
}
func (m *Manager) Resume(id string) {
	m.mu.Lock()
	if d := m.downloads[id]; d != nil && (d.State == Paused || d.State == Error || d.State == Canceled) {
		d.State = Queued
		d.Error = nil
	}
	m.mu.Unlock()
	m.emitState(id)
	m.signal()
}
func (m *Manager) PauseAll() {
	for _, d := range m.List() {
		m.Pause(d.ID)
	}
}
func (m *Manager) ResumeAll() {
	for _, d := range m.List() {
		m.Resume(d.ID)
	}
}
func (m *Manager) Cancel(id string) {
	m.mu.Lock()
	if c := m.cancels[id]; c != nil {
		c()
	}
	if d := m.downloads[id]; d != nil {
		d.State = Canceled
		d.SpeedBps = 0
	}
	m.mu.Unlock()
	m.emitState(id)
	_ = m.save()
}
func (m *Manager) Remove(id string, deleteFile bool) error {
	m.Cancel(id)
	m.mu.Lock()
	d := m.downloads[id]
	delete(m.downloads, id)
	delete(m.limits, id)
	delete(m.authSecrets, id)
	for i, x := range m.order {
		if x == id {
			m.order = append(m.order[:i], m.order[i+1:]...)
			break
		}
	}
	m.mu.Unlock()
	if deleteFile && d != nil {
		_ = os.Remove(filepath.Join(d.DestinationPath, d.Filename))
		_ = os.Remove(filepath.Join(d.DestinationPath, d.Filename) + ".meta")
		_ = os.Remove(m.metaPath(d))
	}
	return m.save()
}
func (m *Manager) Retry(id string) { m.Resume(id) }
func (m *Manager) Reorder(ids []string) error {
	m.mu.Lock()
	seen := map[string]bool{}
	next := []string{}
	for _, id := range ids {
		if m.downloads[id] != nil && !seen[id] {
			next = append(next, id)
			seen[id] = true
		}
	}
	for _, id := range m.order {
		if !seen[id] {
			next = append(next, id)
		}
	}
	m.order = next
	m.mu.Unlock()
	return m.save()
}
func (m *Manager) SetGlobal(v *int64) error {
	m.mu.Lock()
	m.settings.GlobalSpeedLimitBps = v
	m.mu.Unlock()
	return m.save()
}
func (m *Manager) SetLimit(id string, v *int64) error {
	m.mu.Lock()
	m.limits[id] = v
	m.mu.Unlock()
	return m.save()
}
func (m *Manager) UpdateSettings(s Settings) error {
	if s.MaxConcurrent < 1 {
		return errors.New("maxConcurrent must be positive")
	}
	m.mu.Lock()
	previous := clone(m.settings)
	m.settings = clone(s)
	m.normalizeSettings()
	m.mu.Unlock()
	if err := m.configureHTTPClient(); err != nil {
		m.mu.Lock()
		m.settings = previous
		m.mu.Unlock()
		_ = m.configureHTTPClient()
		return err
	}
	m.signal()
	return m.save()
}
func (m *Manager) ResetSettings() (Settings, error) {
	home, _ := os.UserHomeDir()
	defaults := defaultSettings(filepath.Join(home, "Downloads"))
	m.mu.Lock()
	m.settings = defaults
	m.normalizeSettings()
	m.mu.Unlock()
	if err := m.configureHTTPClient(); err != nil {
		return Settings{}, err
	}
	if err := m.save(); err != nil {
		return Settings{}, err
	}
	return m.GetSettings(), nil
}
func (m *Manager) doHTTP(req *http.Request) (*http.Response, error) {
	m.clientMu.RLock()
	client := m.client
	m.clientMu.RUnlock()
	return client.Do(req)
}
func (m *Manager) configureHTTPClient() error {
	m.mu.RLock()
	proxyRaw, useSystem, timeout := strings.TrimSpace(m.settings.ProxyURL), m.settings.UseSystemProxy, m.settings.RequestTimeoutSeconds
	m.mu.RUnlock()
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.MaxIdleConns = 128
	transport.MaxIdleConnsPerHost = 32
	transport.MaxConnsPerHost = 32
	transport.ForceAttemptHTTP2 = true
	if proxyRaw != "" {
		proxyURL, err := url.Parse(proxyRaw)
		if err != nil || proxyURL.Scheme == "" || proxyURL.Host == "" || proxyURL.User != nil {
			return errors.New("proxy URL must include a valid scheme and host, without embedded credentials")
		}
		transport.Proxy = http.ProxyURL(proxyURL)
	} else if useSystem {
		transport.Proxy = http.ProxyFromEnvironment
	} else {
		transport.Proxy = nil
	}
	client := &http.Client{Transport: transport, Timeout: time.Duration(max(timeout, 5)) * time.Second}
	m.clientMu.Lock()
	old := m.client
	m.client = client
	m.clientMu.Unlock()
	if old != nil {
		if t, ok := old.Transport.(*http.Transport); ok {
			t.CloseIdleConnections()
		}
	}
	return nil
}
func (m *Manager) MoveToQueue(ids []string, queueID string) error {
	m.mu.Lock()
	valid := false
	for _, q := range m.settings.Queues {
		if q.ID == queueID {
			valid = true
			break
		}
	}
	if !valid {
		m.mu.Unlock()
		return errors.New("queue does not exist")
	}
	for _, id := range ids {
		if d := m.downloads[id]; d != nil {
			d.QueueID = queueID
		}
	}
	m.mu.Unlock()
	if err := m.save(); err != nil {
		return err
	}
	m.signal()
	return nil
}
func (m *Manager) SetQueueRunning(queueID string, running bool) error {
	m.mu.Lock()
	found := false
	for i := range m.settings.Queues {
		if m.settings.Queues[i].ID == queueID {
			m.settings.Queues[i].Running = running
			found = true
			break
		}
	}
	m.mu.Unlock()
	if !found {
		return errors.New("queue does not exist")
	}
	if err := m.save(); err != nil {
		return err
	}
	m.signal()
	return nil
}
func (m *Manager) SelectVideoFormat(id, format string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	d := m.downloads[id]
	if d == nil {
		return errors.New("download not found")
	}
	if d.Video == nil {
		return errors.New("not a video download")
	}
	d.Video.SelectedFormatID = format
	return m.save()
}
func (m *Manager) Open(id string, folder bool) error {
	m.mu.RLock()
	d := m.downloads[id]
	m.mu.RUnlock()
	if d == nil {
		return errors.New("download not found")
	}
	p := filepath.Join(d.DestinationPath, d.Filename)
	if folder {
		p = d.DestinationPath
	}
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("explorer", p)
	case "darwin":
		cmd = exec.Command("open", p)
	default:
		cmd = exec.Command("xdg-open", p)
	}
	return cmd.Start()
}
func (m *Manager) URL(id string) (string, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if d := m.downloads[id]; d != nil {
		return d.URL, nil
	}
	return "", errors.New("download not found")
}
func ProbeVideo(ctx context.Context, raw, browser, profile string) (VideoInfo, error) {
	tool, findErr := findTool("yt-dlp")
	if findErr != nil {
		return VideoInfo{}, findErr
	}
	args := []string{"-J", "--no-playlist"}
	if (browser == "chrome" || browser == "edge") && profile != "" {
		args = append(args, "--cookies-from-browser", browser+":"+profile)
	}
	args = append(args, "--", raw)
	cmd := exec.CommandContext(ctx, tool, args...)
	hideProcessWindow(cmd)
	out, err := cmd.Output()
	if err != nil {
		return VideoInfo{}, fmt.Errorf("yt-dlp probe failed (install or bundle yt-dlp): %w", err)
	}
	var x struct {
		Title   string `json:"title"`
		Formats []struct {
			ID           string  `json:"format_id"`
			FormatNote   string  `json:"format_note"`
			Ext          string  `json:"ext"`
			Filesize     *int64  `json:"filesize"`
			Vcodec       string  `json:"vcodec"`
			Acodec       string  `json:"acodec"`
			Height       int     `json:"height"`
			Width        int     `json:"width"`
			FPS          float64 `json:"fps"`
			DynamicRange string  `json:"dynamic_range"`
			ABR          float64 `json:"abr"`
		} `json:"formats"`
	}
	if err = json.Unmarshal(out, &x); err != nil {
		return VideoInfo{}, err
	}
	v := VideoInfo{Title: x.Title, Formats: []VideoFormat{}}
	type rankedFormat struct {
		format VideoFormat
		height int
		fps    float64
	}
	ranked := make([]rankedFormat, 0, len(x.Formats))
	seen := make(map[string]bool)
	for _, f := range x.Formats {
		hasVideo := f.Vcodec != "none" && f.Vcodec != ""
		hasAudio := f.Acodec != "none" && f.Acodec != ""
		if !hasVideo {
			continue
		}
		if strings.TrimSpace(f.ID) == "" {
			continue
		}
		// YouTube's 1080p+ formats are normally video-only adaptive streams.
		// Present them as useful combined choices and let yt-dlp select the best
		// matching audio stream for ffmpeg to merge.
		id := f.ID
		if !hasAudio {
			id += "+bestaudio/best"
		}
		quality := strings.TrimSpace(f.FormatNote)
		if quality == "" && f.Height > 0 {
			quality = fmt.Sprintf("%dp", f.Height)
		}
		label := strings.TrimSpace(quality + " " + strings.ToUpper(f.Ext))
		key := fmt.Sprintf("%d|%.2f|%s", f.Height, f.FPS, strings.ToLower(f.Ext))
		if seen[key] {
			continue
		}
		seen[key] = true
		compatibility := "Good"
		codec := strings.ToLower(f.Vcodec)
		audio := strings.ToLower(f.Acodec)
		if strings.EqualFold(f.Ext, "mp4") && (strings.Contains(codec, "avc") || strings.Contains(codec, "h264")) && (hasAudio && strings.Contains(audio, "aac") || !hasAudio) {
			compatibility = "Best"
		}
		hdr := f.DynamicRange != "" && !strings.EqualFold(f.DynamicRange, "SDR")
		ranked = append(ranked, rankedFormat{format: VideoFormat{ID: id, Label: label, Ext: f.Ext, SizeBytes: f.Filesize, HasVideo: true, HasAudio: true, Width: f.Width, Height: f.Height, FPS: f.FPS, VideoCodec: f.Vcodec, AudioCodec: f.Acodec, AudioBitrateKbps: f.ABR, HDR: hdr, Compatibility: compatibility}, height: f.Height, fps: f.FPS})
	}
	sort.SliceStable(ranked, func(i, j int) bool {
		if ranked[i].height != ranked[j].height {
			return ranked[i].height > ranked[j].height
		}
		if ranked[i].fps != ranked[j].fps {
			return ranked[i].fps > ranked[j].fps
		}
		return ptrVal(ranked[i].format.SizeBytes) > ptrVal(ranked[j].format.SizeBytes)
	})
	for _, item := range ranked {
		v.Formats = append(v.Formats, item.format)
	}
	if len(v.Formats) > 0 {
		v.Formats[0].Recommended = true
		v.SelectedFormatID = v.Formats[0].ID
	}
	return v, nil
}
func ptrVal(v *int64) int64 {
	if v == nil {
		return -1
	}
	return *v
}
func max64(a, b int64) int64 {
	if a > b {
		return a
	}
	return b
}
func (m *Manager) emitEvent(name string, v any) {
	if m.emit != nil {
		m.emit(name, v)
	}
}
func (m *Manager) emitState(id string) {
	m.mu.RLock()
	d := m.downloads[id]
	if d != nil {
		d2 := clone(*d)
		m.mu.RUnlock()
		m.emitEvent("stateChange", d2)
		return
	}
	m.mu.RUnlock()
}
func (m *Manager) save() error {
	m.mu.RLock()
	p := persisted{Settings: clone(m.settings), Limits: clone(m.limits)}
	for _, id := range m.order {
		if d := m.downloads[id]; d != nil {
			p.Downloads = append(p.Downloads, clone(d))
		}
	}
	m.mu.RUnlock()
	return m.saveStore(p)
}
func (m *Manager) load() error {
	p, found, err := m.loadStore()
	if err != nil {
		return err
	}
	if !found {
		p, found = m.loadLegacyJSON()
		if found {
			if err := m.saveStore(p); err != nil {
				return err
			}
			_ = os.Rename(m.statePath, m.statePath+".migrated.bak")
		}
	}
	if !found {
		return nil
	}
	m.settings = p.Settings
	m.normalizeSettings()
	m.limits = p.Limits
	if m.limits == nil {
		m.limits = map[string]*int64{}
	}
	for _, d := range p.Downloads {
		if d.State == Active || d.State == Connecting {
			if m.settings.AutoResumeOnStartup {
				d.State = Queued
			} else {
				d.State = Paused
			}
		}
		m.downloads[d.ID] = d
		m.order = append(m.order, d.ID)
	}
	return nil
}

func (m *Manager) loadLegacyJSON() (persisted, bool) {
	b, err := os.ReadFile(m.statePath)
	if err != nil {
		return persisted{}, false
	}
	var p persisted
	if json.Unmarshal(b, &p) != nil {
		return persisted{}, false
	}
	return p, true
}

func (m *Manager) normalizeSettings() {
	if m.settings.MaxConcurrent < 1 {
		m.settings.MaxConcurrent = 4
	}
	if len(m.settings.Queues) == 0 {
		m.settings.Queues = []Queue{{ID: "default", Name: "Downloads", Priority: 0, MaxConcurrent: m.settings.MaxConcurrent, Running: true}}
	}
	for i := range m.settings.Queues {
		if m.settings.Queues[i].ID == "" {
			m.settings.Queues[i].ID = fmt.Sprintf("queue-%d", i+1)
		}
		if m.settings.Queues[i].MaxConcurrent < 1 {
			m.settings.Queues[i].MaxConcurrent = m.settings.MaxConcurrent
		}
		if m.settings.Queues[i].Name == "" {
			m.settings.Queues[i].Name = "Queue"
		}
		if m.settings.Queues[i].Schedule == nil {
			m.settings.Queues[i].Schedule = &Schedule{Enabled: false, StartHHmm: "01:00", StopHHmm: "08:00", Weekdays: []int{0, 1, 2, 3, 4, 5, 6}, Repeat: true}
		}
	}
	if m.settings.SegmentCount < 1 || m.settings.SegmentCount > 32 {
		m.settings.SegmentCount = 16
	}
	if m.settings.RetryCount < 0 {
		m.settings.RetryCount = 0
	}
	if m.settings.RetryDelaySeconds < 1 {
		m.settings.RetryDelaySeconds = 5
	}
	if m.settings.RequestTimeoutSeconds < 5 {
		m.settings.RequestTimeoutSeconds = 30
	}
	if m.settings.UserAgent == "" {
		m.settings.UserAgent = "IDM-next/1.0"
	}
	if m.settings.OverwritePolicy == "" {
		m.settings.OverwritePolicy = "rename"
	}
	if m.settings.TemporaryDir == "" {
		m.settings.TemporaryDir = filepath.Join(os.TempDir(), "IDM-next")
	}
	if len(m.settings.CaptureFileTypes) == 0 {
		m.settings.CaptureFileTypes = []string{"zip", "rar", "7z", "exe", "msi", "pdf", "mp3", "mp4", "mkv", "iso"}
	}
	if m.settings.PreferredVideoQuality == "" {
		m.settings.PreferredVideoQuality = "best"
	}
	if m.settings.PreferredVideoContainer == "" {
		m.settings.PreferredVideoContainer = "mp4"
	}
	if m.settings.ConcurrentFragments < 1 || m.settings.ConcurrentFragments > 16 {
		m.settings.ConcurrentFragments = 4
	}
	if m.settings.ExcludedSites == nil {
		// Never leave this nil — it serialises to JSON null and the UI expects
		// an array it can render/join.
		m.settings.ExcludedSites = []string{}
	}
}
func saveMeta(path string, d *Download) error {
	b, _ := json.Marshal(d.Segments)
	return os.WriteFile(path, b, 0644)
}
func loadMeta(path string, d *Download) bool {
	b, err := os.ReadFile(path)
	if err == nil {
		var s []SegmentProgress
		if json.Unmarshal(b, &s) == nil && len(s) == len(d.Segments) {
			d.Segments = s
			d.DownloadedBytes = 0
			for _, x := range s {
				d.DownloadedBytes += x.Done
			}
			return true
		}
	}
	return false
}

func (m *Manager) metaPath(d *Download) string {
	dir := m.settings.TemporaryDir
	if dir == "" {
		dir = filepath.Join(os.TempDir(), "IDM-next")
	}
	_ = os.MkdirAll(dir, 0755)
	return filepath.Join(dir, d.ID+".meta.json")
}
