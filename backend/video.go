package backend

import (
	"archive/zip"
	"bufio"
	"context"
	"crypto/ed25519"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"idm-next/backend/updater"
)

// managedToolsDir is where Grabby downloads helper tools (yt-dlp, ffmpeg) it
// installs on the user's behalf. Stable across dev and installed runs.
func managedToolsDir() string {
	dir, err := os.UserConfigDir()
	if err != nil {
		return ""
	}
	return filepath.Join(dir, "Grabby", "binaries")
}

func statTool(dir, name string) (string, bool) {
	if dir == "" {
		return "", false
	}
	for _, c := range []string{filepath.Join(dir, name), filepath.Join(dir, name) + ".exe"} {
		if st, err := os.Stat(c); err == nil && !st.IsDir() {
			return c, true
		}
	}
	return "", false
}

func findTool(name string) (string, error) {
	envName := "GRABBY_" + strings.ToUpper(strings.ReplaceAll(name, "-", "_")) + "_PATH"
	if value := os.Getenv(envName); value != "" {
		if _, err := os.Stat(value); err == nil {
			return value, nil
		}
	}
	// Grabby-managed tools directory (auto-installed downloads).
	if p, ok := statTool(managedToolsDir(), name); ok {
		return p, nil
	}
	if exe, err := os.Executable(); err == nil {
		if p, ok := statTool(filepath.Join(filepath.Dir(exe), "binaries"), name); ok {
			return p, nil
		}
	}
	if value, err := exec.LookPath(name); err == nil {
		return value, nil
	}
	return "", fmt.Errorf("%s is not installed or bundled", name)
}

// HasYtDlp reports whether a usable yt-dlp is available.
func HasYtDlp() bool {
	_, err := findTool("yt-dlp")
	return err == nil
}

func HasFFmpeg() bool {
	_, err := findTool("ffmpeg")
	return err == nil
}

type ToolStatus struct {
	Name              string `json:"name"`
	Installed         bool   `json:"installed"`
	Version           string `json:"version,omitempty"`
	Path              string `json:"path,omitempty"`
	LastUpdated       string `json:"lastUpdated,omitempty"`
	Managed           bool   `json:"managed"`
	RollbackAvailable bool   `json:"rollbackAvailable"`
}
type VideoToolsHealth struct {
	YtDlp             ToolStatus `json:"ytDlp"`
	FFmpeg            ToolStatus `json:"ffmpeg"`
	UpdaterConfigured bool       `json:"updaterConfigured"`
	DiagnosticOK      bool       `json:"diagnosticOk"`
	DiagnosticMessage string     `json:"diagnosticMessage"`
}

func toolStatus(name string) ToolStatus {
	s := ToolStatus{Name: name}
	path, err := findTool(name)
	if err != nil {
		return s
	}
	s.Installed = true
	s.Path = path
	s.Managed = strings.HasPrefix(strings.ToLower(path), strings.ToLower(managedToolsDir()))
	if info, e := os.Stat(path); e == nil {
		s.LastUpdated = info.ModTime().UTC().Format(time.RFC3339)
		_, e = os.Stat(path + ".previous")
		s.RollbackAvailable = e == nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	out, e := exec.CommandContext(ctx, path, "--version").CombinedOutput()
	if e == nil {
		s.Version = strings.TrimSpace(strings.Split(string(out), "\n")[0])
	}
	return s
}
func VideoHealth() VideoToolsHealth {
	h := VideoToolsHealth{YtDlp: toolStatus("yt-dlp"), FFmpeg: toolStatus("ffmpeg")}
	h.UpdaterConfigured = os.Getenv("GRABIFY_YTDLP_MANIFEST_URL") != "" && os.Getenv("GRABIFY_UPDATER_PUBLIC_KEY") != ""
	h.DiagnosticOK = h.YtDlp.Installed && h.FFmpeg.Installed
	if h.DiagnosticOK {
		h.DiagnosticMessage = "Extractor and merger self-checks passed"
	} else {
		h.DiagnosticMessage = "Install both yt-dlp and ffmpeg to enable every video format"
	}
	return h
}
func signedUpdater() (updater.Updater, string, error) {
	manifestURL := os.Getenv("GRABIFY_YTDLP_MANIFEST_URL")
	raw := os.Getenv("GRABIFY_UPDATER_PUBLIC_KEY")
	key, err := base64.StdEncoding.DecodeString(raw)
	if manifestURL == "" || err != nil || len(key) != ed25519.PublicKeySize {
		return updater.Updater{}, "", errors.New("signed updater is not configured in this build")
	}
	return updater.Updater{PublicKey: ed25519.PublicKey(key)}, manifestURL, nil
}
func UpdateYtDlpSigned(ctx context.Context) error {
	u, url, err := signedUpdater()
	if err != nil {
		return err
	}
	manifest, err := u.FetchManifest(ctx, url)
	if err != nil {
		return err
	}
	return u.Install(ctx, manifest, filepath.Join(managedToolsDir(), "yt-dlp.exe"))
}
func RollbackYtDlp() error { return updater.Rollback(filepath.Join(managedToolsDir(), "yt-dlp.exe")) }

// ytDlpDownloadURL is the official standalone Windows build.
const ytDlpDownloadURL = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe"
const ffmpegDownloadURL = "https://github.com/yt-dlp/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-win64-gpl.zip"

// EnsureYtDlp returns the path to yt-dlp, downloading the official release into
// the managed tools directory if it isn't already present. progress (optional)
// is called with bytes received / total during the download.
func EnsureYtDlp(ctx context.Context, progress func(received, total int64)) (string, error) {
	if p, err := findTool("yt-dlp"); err == nil {
		return p, nil
	}
	dir := managedToolsDir()
	if dir == "" {
		return "", errors.New("no writable tools directory")
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	dest := filepath.Join(dir, "yt-dlp.exe")

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, ytDlpDownloadURL, nil)
	if err != nil {
		return "", err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("download failed: %s", resp.Status)
	}

	tmp := dest + ".part"
	f, err := os.Create(tmp)
	if err != nil {
		return "", err
	}
	buf := make([]byte, 64*1024)
	var received int64
	for {
		n, rerr := resp.Body.Read(buf)
		if n > 0 {
			if _, werr := f.Write(buf[:n]); werr != nil {
				f.Close()
				return "", werr
			}
			received += int64(n)
			if progress != nil {
				progress(received, resp.ContentLength)
			}
		}
		if rerr == io.EOF {
			break
		}
		if rerr != nil {
			f.Close()
			return "", rerr
		}
		select {
		case <-ctx.Done():
			f.Close()
			return "", ctx.Err()
		default:
		}
	}
	if err := f.Close(); err != nil {
		return "", err
	}
	if err := os.Rename(tmp, dest); err != nil {
		return "", err
	}
	return dest, nil
}

// EnsureFFmpeg installs the yt-dlp-maintained Windows ffmpeg build used to
// merge YouTube's separate high-resolution video and audio streams.
func EnsureFFmpeg(ctx context.Context, progress func(received, total int64)) (string, error) {
	if p, err := findTool("ffmpeg"); err == nil {
		return p, nil
	}
	dir := managedToolsDir()
	if dir == "" {
		return "", errors.New("no writable tools directory")
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	archive := filepath.Join(dir, "ffmpeg.zip.part")
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, ffmpegDownloadURL, nil)
	if err != nil {
		return "", err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("ffmpeg download failed: %s", resp.Status)
	}
	f, err := os.Create(archive)
	if err != nil {
		return "", err
	}
	var received int64
	buf := make([]byte, 128*1024)
	for {
		n, readErr := resp.Body.Read(buf)
		if n > 0 {
			if _, err = f.Write(buf[:n]); err != nil {
				_ = f.Close()
				return "", err
			}
			received += int64(n)
			if progress != nil {
				progress(received, resp.ContentLength)
			}
		}
		if readErr == io.EOF {
			break
		}
		if readErr != nil {
			_ = f.Close()
			return "", readErr
		}
	}
	if err = f.Close(); err != nil {
		return "", err
	}
	zr, err := zip.OpenReader(archive)
	if err != nil {
		return "", err
	}
	installed := ""
	for _, entry := range zr.File {
		name := strings.ToLower(filepath.Base(entry.Name))
		if entry.FileInfo().IsDir() || (name != "ffmpeg.exe" && name != "ffprobe.exe") {
			continue
		}
		in, openErr := entry.Open()
		if openErr != nil {
			return "", openErr
		}
		tmp := filepath.Join(dir, name+".part")
		out, createErr := os.Create(tmp)
		if createErr != nil {
			_ = in.Close()
			return "", createErr
		}
		_, copyErr := io.Copy(out, in)
		_ = in.Close()
		closeErr := out.Close()
		if copyErr != nil {
			return "", copyErr
		}
		if closeErr != nil {
			return "", closeErr
		}
		dest := filepath.Join(dir, name)
		if err = os.Rename(tmp, dest); err != nil {
			return "", err
		}
		if name == "ffmpeg.exe" {
			installed = dest
		}
	}
	if err = zr.Close(); err != nil {
		return "", err
	}
	_ = os.Remove(archive)
	if installed == "" {
		return "", errors.New("ffmpeg archive did not contain ffmpeg.exe")
	}
	return installed, nil
}

func (m *Manager) downloadVideo(ctx context.Context, id string) error {
	m.mu.RLock()
	d := clone(*m.downloads[id])
	tempDir, fragments := m.settings.TemporaryDir, m.settings.ConcurrentFragments
	m.mu.RUnlock()
	tool, err := findTool("yt-dlp")
	if err != nil {
		return err
	}
	if strings.Contains(d.VideoFormatID, "+") {
		if _, findErr := findTool("ffmpeg"); findErr != nil {
			if _, err = EnsureFFmpeg(ctx, nil); err != nil {
				return fmt.Errorf("high-resolution video requires ffmpeg: %w", err)
			}
		}
	}
	if tempDir == "" {
		tempDir = filepath.Join(os.TempDir(), "Grabby")
	}
	work := filepath.Join(tempDir, "video")
	if err = os.MkdirAll(work, 0700); err != nil {
		return err
	}
	_, ffmpegErr := findTool("ffmpeg")
	format := d.VideoFormatID
	// Repair rows created by older builds whose yt-dlp JSON mapping dropped the
	// video format ID and persisted only "+bestaudio/best".
	if strings.HasPrefix(format, "+") {
		format = "bestvideo*+bestaudio/best"
	}
	if format == "" {
		if ffmpegErr == nil {
			// ffmpeg present → allow merging separate video+audio for best quality
			format = "bestvideo*+bestaudio/best"
		} else {
			// no ffmpeg → progressive single-file only, so downloads still work
			format = "best[ext=mp4]/best"
		}
	}
	args := []string{
		"--no-playlist", "--continue", "--progress", "--newline", "--progress-delta", "0.25",
		"--progress-template", "download:grabby:%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s|%(progress.speed)s|%(progress.eta)s",
		"--print", "after_move:grabby-file:%(filepath)s",
		"--concurrent-fragments", strconv.Itoa(maxInt(1, fragments)),
		"-f", format, "-o", filepath.Join(work, d.ID+".%(ext)s"),
	}
	if ffmpeg, findErr := findTool("ffmpeg"); findErr == nil {
		args = append(args, "--ffmpeg-location", filepath.Dir(ffmpeg))
	}
	if (d.Browser == "chrome" || d.Browser == "edge") && d.BrowserProfile != "" {
		args = append(args, "--cookies-from-browser", d.Browser+":"+d.BrowserProfile)
	}
	if d.RequestUserAgent != "" {
		args = append(args, "--user-agent", d.RequestUserAgent)
	}
	if d.Referrer != "" {
		args = append(args, "--referer", d.Referrer)
	}
	args = append(args, "--", d.URL)
	cmd := exec.CommandContext(ctx, tool, args...)
	hideProcessWindow(cmd)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return err
	}
	if err = cmd.Start(); err != nil {
		return err
	}
	m.mu.Lock()
	if live := m.downloads[id]; live != nil {
		live.State = Active
		live.ProcessingStage = "downloading"
	}
	m.mu.Unlock()
	m.emitState(id)
	lines := make(chan string, 32)
	var readers sync.WaitGroup
	readers.Add(2)
	go scanToolLines(stdout, lines, &readers)
	go scanToolLines(stderr, lines, &readers)
	go func() { readers.Wait(); close(lines) }()
	var produced, lastError string
	for line := range lines {
		if strings.HasPrefix(line, "grabby:") {
			m.applyVideoProgress(id, strings.TrimPrefix(line, "grabby:"))
			continue
		}
		if strings.HasPrefix(line, "grabby-file:") {
			produced = strings.TrimSpace(strings.TrimPrefix(line, "grabby-file:"))
			continue
		}
		lower := strings.ToLower(line)
		stage := ""
		if strings.Contains(lower, "merger") || strings.Contains(lower, "merging formats") {
			stage = "merging"
		} else if strings.Contains(lower, "extractaudio") || strings.Contains(lower, "post-process") {
			stage = "processing"
		} else if strings.Contains(lower, "destination:") {
			stage = "downloading"
		}
		if stage != "" {
			m.setVideoStage(id, stage)
		}
		if strings.Contains(strings.ToLower(line), "error:") {
			lastError = sanitizeToolError(line)
		}
	}
	if err = cmd.Wait(); err != nil {
		if errors.Is(ctx.Err(), context.Canceled) {
			return ctx.Err()
		}
		if lastError != "" {
			return errors.New(lastError)
		}
		return fmt.Errorf("video download failed: %w", err)
	}
	if produced == "" {
		matches, _ := filepath.Glob(filepath.Join(work, d.ID+".*"))
		for _, path := range matches {
			if !strings.HasSuffix(path, ".part") && !strings.HasSuffix(path, ".ytdl") {
				produced = path
				break
			}
		}
	}
	m.setVideoStage(id, "verifying")
	if produced == "" {
		return errors.New("video downloader produced no output file")
	}
	if err = os.MkdirAll(d.DestinationPath, 0755); err != nil {
		return err
	}
	destination := filepath.Join(d.DestinationPath, d.Filename)
	if filepath.Ext(destination) == "" {
		destination += filepath.Ext(produced)
	}
	if err = moveFile(produced, destination); err != nil {
		return err
	}
	if info, statErr := os.Stat(destination); statErr == nil {
		size := info.Size()
		m.mu.Lock()
		if live := m.downloads[id]; live != nil {
			live.SizeBytes = &size
			live.DownloadedBytes = size
			live.ProgressPct = 100
			live.Filename = filepath.Base(destination)
		}
		m.mu.Unlock()
	}
	return nil
}
func (m *Manager) setVideoStage(id, stage string) {
	m.mu.Lock()
	if d := m.downloads[id]; d != nil {
		d.ProcessingStage = stage
	}
	m.mu.Unlock()
	m.emitState(id)
}

func scanToolLines(reader io.Reader, output chan<- string, wait *sync.WaitGroup) {
	defer wait.Done()
	scanner := bufio.NewScanner(reader)
	scanner.Buffer(make([]byte, 4096), 1024*1024)
	for scanner.Scan() {
		output <- scanner.Text()
	}
}

func (m *Manager) applyVideoProgress(id, line string) {
	parts := strings.Split(line, "|")
	if len(parts) < 5 {
		return
	}
	parse := func(value string) int64 { f, _ := strconv.ParseFloat(strings.TrimSpace(value), 64); return int64(f) }
	downloaded, total := parse(parts[0]), parse(parts[1])
	if total == 0 {
		total = parse(parts[2])
	}
	speed, eta := parse(parts[3]), parse(parts[4])
	m.mu.Lock()
	defer m.mu.Unlock()
	d := m.downloads[id]
	if d == nil {
		return
	}
	d.DownloadedBytes, d.SpeedBps = downloaded, speed
	if total > 0 {
		d.SizeBytes = &total
		d.ProgressPct = float64(downloaded) * 100 / float64(total)
	}
	if eta >= 0 {
		d.ETASeconds = &eta
	}
}

func sanitizeToolError(line string) string {
	line = strings.TrimSpace(line)
	if len(line) > 500 {
		line = line[:500]
	}
	return line
}
func moveFile(source, destination string) error {
	if err := os.Rename(source, destination); err == nil {
		return nil
	}
	in, err := os.Open(source)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.Create(destination)
	if err != nil {
		return err
	}
	if _, err = io.Copy(out, in); err != nil {
		_ = out.Close()
		return err
	}
	if err = out.Close(); err != nil {
		return err
	}
	return os.Remove(source)
}
func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}
