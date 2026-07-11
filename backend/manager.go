package backend

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
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
	mu        sync.RWMutex
	downloads map[string]*Download
	order     []string
	settings  Settings
	limits    map[string]*int64
	cancels   map[string]context.CancelFunc
	statePath string
	client    *http.Client
	emit      EventSink
	wake      chan struct{}
	closed    chan struct{}
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
	m := &Manager{downloads: map[string]*Download{}, limits: map[string]*int64{}, cancels: map[string]context.CancelFunc{}, statePath: filepath.Join(stateDir, "state.json"), client: &http.Client{}, emit: emit, wake: make(chan struct{}, 1), closed: make(chan struct{})}
	m.settings = Settings{DownloadDir: dl, MaxConcurrent: 4, Categories: []Category{{ID: "general", Name: "General", Folder: dl, Extensions: []string{}}, {ID: "video", Name: "Video", Folder: filepath.Join(dl, "Video"), Extensions: []string{"mp4", "mkv", "webm", "mov"}}, {ID: "music", Name: "Music", Folder: filepath.Join(dl, "Music"), Extensions: []string{"mp3", "m4a", "flac", "wav"}}, {ID: "documents", Name: "Documents", Folder: filepath.Join(dl, "Documents"), Extensions: []string{"pdf", "doc", "docx", "zip"}}}}
	m.load()
	go m.scheduler()
	go m.progressEmitter()
	return m, nil
}
func (m *Manager) Close() {
	close(m.closed)
	m.mu.Lock()
	for _, c := range m.cancels {
		c()
	}
	m.mu.Unlock()
	_ = m.save()
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
func (m *Manager) Add(r AddRequest) (Download, error) {
	u, err := url.Parse(r.URL)
	if err != nil || u.Scheme == "" {
		return Download{}, errors.New("invalid download URL")
	}
	if r.Kind == "" {
		r.Kind = "http"
	}
	if r.Filename == "" {
		r.Filename = filepath.Base(strings.TrimSuffix(u.Path, "/"))
		if r.Filename == "" || r.Filename == "." {
			r.Filename = "download"
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
	d := &Download{ID: id, URL: r.URL, Filename: r.Filename, DestinationPath: r.DestinationPath, Category: r.Category, Kind: r.Kind, State: Queued, DateAdded: NowISO()}
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
		max := m.settings.MaxConcurrent
		if max < 1 {
			max = 1
		}
		for _, id := range m.order {
			if running >= max {
				break
			}
			d := m.downloads[id]
			if d != nil && d.State == Queued {
				ctx, cancel := context.WithCancel(context.Background())
				m.cancels[id] = cancel
				d.State = Connecting
				running++
				go m.run(ctx, id)
			}
		}
		m.mu.Unlock()
	}
}
func (m *Manager) run(ctx context.Context, id string) {
	err := m.downloadHTTP(ctx, id)
	m.mu.Lock()
	delete(m.cancels, id)
	d := m.downloads[id]
	if d != nil {
		if err == nil {
			d.State = Completed
			now := NowISO()
			d.DateCompleted = &now
			d.SpeedBps = 0
		} else if !errors.Is(err, context.Canceled) && d.State != Paused && d.State != Canceled {
			d.State = Error
			s := err.Error()
			d.Error = &s
			d.SpeedBps = 0
		}
		snap := clone(*d)
		m.mu.Unlock()
		m.emitEvent("stateChange", snap)
	} else {
		m.mu.Unlock()
	}
	_ = m.save()
	m.signal()
}
func (m *Manager) downloadHTTP(ctx context.Context, id string) error {
	m.mu.RLock()
	d := clone(*m.downloads[id])
	m.mu.RUnlock()
	if d.Kind != "http" {
		return fmt.Errorf("%s downloads require an external integration", d.Kind)
	}
	headCtx, cancelHead := context.WithTimeout(ctx, 30*time.Second)
	defer cancelHead()
	req, _ := http.NewRequestWithContext(headCtx, http.MethodHead, d.URL, nil)
	resp, err := m.client.Do(req)
	if err != nil {
		return err
	}
	resp.Body.Close()
	size := resp.ContentLength
	ranges := strings.Contains(strings.ToLower(resp.Header.Get("Accept-Ranges")), "bytes") && size > 0
	m.mu.Lock()
	live := m.downloads[id]
	live.SupportsResume = ranges
	if size >= 0 {
		live.SizeBytes = &size
	}
	if ranges {
		live.Segments = makeSegments(size, 8)
	} else {
		live.Segments = []SegmentProgress{{Index: 0, From: 0, To: max64(size-1, 0)}}
	}
	loadMeta(filepath.Join(live.DestinationPath, live.Filename)+".meta", live)
	live.State = Active
	m.mu.Unlock()
	m.emitState(id)
	if err := os.MkdirAll(d.DestinationPath, 0755); err != nil {
		return err
	}
	path := filepath.Join(d.DestinationPath, d.Filename)
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
	var wg sync.WaitGroup
	errs := make(chan error, len(segs))
	for _, seg := range segs {
		if seg.Done >= seg.To-seg.From+1 {
			continue
		}
		wg.Add(1)
		go func(s SegmentProgress) {
			defer wg.Done()
			if e := m.fetchSegment(ctx, id, f, s, ranges); e != nil {
				errs <- e
			}
		}(seg)
	}
	wg.Wait()
	close(errs)
	for e := range errs {
		if e != nil {
			return e
		}
	}
	_ = os.Remove(path + ".meta")
	return nil
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
func (m *Manager) fetchSegment(ctx context.Context, id string, f *os.File, s SegmentProgress, ranged bool) error {
	start := s.From + s.Done
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, m.urlFor(id), nil)
	if ranged {
		req.Header.Set("Range", fmt.Sprintf("bytes=%d-%d", start, s.To))
	}
	resp, err := m.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if ranged && resp.StatusCode != http.StatusPartialContent {
		return fmt.Errorf("server rejected range request: %s", resp.Status)
	}
	if !ranged && resp.StatusCode/100 != 2 {
		return fmt.Errorf("server returned %s", resp.Status)
	}
	buf := make([]byte, 128*1024)
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
			return nil
		}
		if e != nil {
			return e
		}
	}
}
func (m *Manager) urlFor(id string) string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.downloads[id].URL
}
func (m *Manager) throttle(ctx context.Context, id string, n int) error {
	m.mu.RLock()
	lim := m.settings.GlobalSpeedLimitBps
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
					_ = saveMeta(filepath.Join(d.DestinationPath, d.Filename)+".meta", d)
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
	m.settings = clone(s)
	m.mu.Unlock()
	m.signal()
	return m.save()
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
func ProbeVideo(ctx context.Context, raw string) (VideoInfo, error) {
	cmd := exec.CommandContext(ctx, "yt-dlp", "-J", "--no-playlist", raw)
	out, err := cmd.Output()
	if err != nil {
		return VideoInfo{}, fmt.Errorf("yt-dlp probe failed (install or bundle yt-dlp): %w", err)
	}
	var x struct {
		Title   string `json:"title"`
		Formats []struct {
			ID, FormatNote, Ext string
			Filesize            *int64 `json:"filesize"`
			Vcodec, Acodec      string
		} `json:"formats"`
	}
	if err = json.Unmarshal(out, &x); err != nil {
		return VideoInfo{}, err
	}
	v := VideoInfo{Title: x.Title, Formats: []VideoFormat{}}
	for _, f := range x.Formats {
		v.Formats = append(v.Formats, VideoFormat{ID: f.ID, Label: strings.TrimSpace(f.FormatNote + " " + f.Ext), Ext: f.Ext, SizeBytes: f.Filesize, HasVideo: f.Vcodec != "none" && f.Vcodec != "", HasAudio: f.Acodec != "none" && f.Acodec != ""})
	}
	sort.SliceStable(v.Formats, func(i, j int) bool { return ptrVal(v.Formats[i].SizeBytes) > ptrVal(v.Formats[j].SizeBytes) })
	if len(v.Formats) > 0 {
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
	b, err := json.MarshalIndent(p, "", "  ")
	if err != nil {
		return err
	}
	tmp := m.statePath + ".tmp"
	if err = os.WriteFile(tmp, b, 0644); err != nil {
		return err
	}
	return os.Rename(tmp, m.statePath)
}
func (m *Manager) load() {
	b, err := os.ReadFile(m.statePath)
	if err != nil {
		return
	}
	var p persisted
	if json.Unmarshal(b, &p) != nil {
		return
	}
	m.settings = p.Settings
	if m.settings.MaxConcurrent < 1 {
		m.settings.MaxConcurrent = 4
	}
	m.limits = p.Limits
	if m.limits == nil {
		m.limits = map[string]*int64{}
	}
	for _, d := range p.Downloads {
		if d.State == Active || d.State == Connecting {
			d.State = Paused
		}
		m.downloads[d.ID] = d
		m.order = append(m.order, d.ID)
	}
}
func saveMeta(path string, d *Download) error {
	b, _ := json.Marshal(d.Segments)
	return os.WriteFile(path, b, 0644)
}
func loadMeta(path string, d *Download) {
	b, err := os.ReadFile(path)
	if err == nil {
		var s []SegmentProgress
		if json.Unmarshal(b, &s) == nil && len(s) == len(d.Segments) {
			d.Segments = s
			d.DownloadedBytes = 0
			for _, x := range s {
				d.DownloadedBytes += x.Done
			}
		}
	}
}
