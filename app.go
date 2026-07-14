package main

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"net"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/energye/systray"
	"github.com/wailsapp/wails/v2/pkg/runtime"
	"rivlet/backend"
	"rivlet/backend/capture"
)

// App is the Wails adapter. Domain and engine logic live in backend.Manager.
type App struct {
	ctx     context.Context
	manager *backend.Manager
	started bool // true once startup completed, so restored state on load
	// (which does not emit) never triggers spurious notifications
	quitting bool // set when the user chooses Quit from the tray, so the
	// close is allowed through instead of hiding to the tray
	captureListener  net.Listener
	captureSecret    string
	captureMu        sync.Mutex
	captureSeen      map[string]struct{}
	browserConnected bool // set once the extension successfully talks to us
}

func NewApp() *App { return &App{} }

// migrateLegacyState keeps existing installations intact after the Rivlet
// rebrand. Earlier builds stored downloads, browser secrets, and tools under
// %APPDATA%/Grabby. Move that directory only when the
// new location does not exist; a failed move simply leaves the old install
// usable and starts Rivlet with a fresh state.
func migrateLegacyState(configDir string) {
	if configDir == "" {
		return
	}
	newPath := filepath.Join(configDir, "Rivlet")
	legacyPath := filepath.Join(configDir, "Grabby")
	if _, err := os.Stat(newPath); err == nil {
		return
	}
	if _, err := os.Stat(legacyPath); err == nil {
		_ = os.Rename(legacyPath, newPath)
	}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	dir, _ := os.UserConfigDir()
	migrateLegacyState(dir)
	a.manager, _ = backend.NewManager(filepath.Join(dir, "Rivlet"), func(name string, payload any) {
		runtime.EventsEmit(ctx, name, payload)
		// A finished or failed download raises a native Windows notification.
		if a.started && name == "stateChange" {
			if d, ok := payload.(backend.Download); ok {
				settings := a.manager.GetSettings()
				if settings.NotifyOnComplete {
					notifyDownload(d)
				}
				if settings.ShowCompletionDialog && d.State == backend.Completed {
					runtime.EventsEmit(ctx, "completionRequested", d)
				}
			}
		}
	})
	// to Free — the engine never blocks on this.
	a.started = true
	a.captureSeen = make(map[string]struct{})
	a.captureSecret, _ = capture.EnsureSecret()
	if listener, err := capture.Listen(); err == nil {
		a.captureListener = listener
		go a.serveCapture(listener)
	}
	// Point the browsers' native-messaging config at our host so the extension
	// can reach us — works in dev too, not just via the installer.
	registerNativeHost()
	// System tray runs on its own message loop; keep Rivlet alive when the
	// window is hidden and offer a way to restore or truly quit it.
	go systray.Run(a.trayReady, func() {})
}
func (a *App) shutdown(context.Context) {
	if a.captureListener != nil {
		_ = a.captureListener.Close()
	}
	systray.Quit()
	if a.manager != nil {
		a.manager.Close()
	}
}

// markBrowserConnected records that the extension has reached us and, on the
// first successful connection, tells the UI so the setup flow can confirm it.
func (a *App) markBrowserConnected(browser string) {
	a.captureMu.Lock()
	first := !a.browserConnected
	a.browserConnected = true
	a.captureMu.Unlock()
	if first && a.ctx != nil {
		runtime.EventsEmit(a.ctx, "browserConnected", browser)
	}
}

func (a *App) serveCapture(listener net.Listener) {
	for {
		conn, err := listener.Accept()
		if err != nil {
			return
		}
		go a.handleCapture(conn)
	}
}

func (a *App) handleCapture(conn net.Conn) {
	defer conn.Close()
	var request capture.Envelope
	if err := capture.Read(conn, &request); err != nil {
		_ = capture.Write(conn, capture.Response{Version: capture.Version, OK: false, Error: err.Error()})
		return
	}
	response := capture.Response{Version: capture.Version, ID: request.ID}
	if err := request.Validate(); err != nil {
		response.Error = err.Error()
		_ = capture.Write(conn, response)
		return
	}
	if subtle.ConstantTimeCompare([]byte(request.Secret), []byte(a.captureSecret)) != 1 {
		response.Error = "authentication failed"
		_ = capture.Write(conn, response)
		return
	}
	a.markBrowserConnected(request.Source.Browser)
	a.captureMu.Lock()
	if _, duplicate := a.captureSeen[request.ID]; duplicate {
		a.captureMu.Unlock()
		response.OK = true
		response.Data = map[string]any{"duplicate": true}
		_ = capture.Write(conn, response)
		return
	}
	a.captureSeen[request.ID] = struct{}{}
	if len(a.captureSeen) > 2048 {
		a.captureSeen = map[string]struct{}{request.ID: {}}
	}
	a.captureMu.Unlock()

	var add backend.AddRequest
	switch request.Action {
	case "health":
		settings := a.manager.GetSettings()
		response.OK = true
		response.Data = map[string]any{"app": "Rivlet", "ready": true, "captureFileTypes": settings.CaptureFileTypes, "excludedSites": settings.ExcludedSites, "videoEnabled": settings.VideoDetectionEnabled, "disabledVideoSites": settings.DisabledVideoSites}
	case "capture.link", "capture.download":
		var payload capture.LinkPayload
		if err := json.Unmarshal(request.Payload, &payload); err != nil {
			response.Error = "invalid link payload"
			break
		}
		if err := capture.ValidateHTTPURL(payload.URL); err != nil {
			response.Error = err.Error()
			break
		}
		add = backend.AddRequest{URL: payload.URL, Filename: payload.SuggestedFilename, Kind: "http", Referrer: payload.Referrer, UserAgent: payload.UserAgent, Browser: request.Source.Browser, CookieHeader: payload.CookieHeader}
		if request.Action == "capture.download" {
			if siteExcluded(payload.URL, a.manager.GetSettings().ExcludedSites) {
				response.Error = "This site is excluded by Rivlet settings"
				break
			}
			download, err := a.manager.Add(add)
			if err != nil {
				response.Error = err.Error()
				break
			}
			response.OK = true
			response.Data = map[string]any{"downloadId": download.ID}
		} else {
			response.OK = true
		}
	case "capture.video":
		var payload capture.VideoPayload
		if err := json.Unmarshal(request.Payload, &payload); err != nil {
			response.Error = "invalid video payload"
			break
		}
		if payload.DRMDetected {
			response.Error = "DRM-protected media is not supported"
			break
		}
		if err := capture.ValidateHTTPURL(payload.PageURL); err != nil {
			response.Error = err.Error()
			break
		}
		settings := a.manager.GetSettings()
		if !settings.VideoDetectionEnabled {
			response.Error = "Video detection is disabled in Rivlet settings"
			break
		}
		if siteExcluded(payload.PageURL, settings.DisabledVideoSites) {
			response.Error = "Video detection is disabled for this site"
			break
		}
		profile := ""
		if settings.CookieConsent && settings.CookieBrowser == request.Source.Browser {
			profile = settings.CookieProfile
		}
		add = backend.AddRequest{URL: payload.PageURL, Filename: payload.Title, Kind: "video", UserAgent: payload.UserAgent, Browser: request.Source.Browser, BrowserProfile: profile}
		response.OK = true
	case "capture.torrent":
		var payload capture.LinkPayload
		if err := json.Unmarshal(request.Payload, &payload); err != nil {
			response.Error = "invalid torrent payload"
			break
		}
		if !capture.IsMagnet(payload.URL) {
			response.Error = "not a magnet link"
			break
		}
		download, err := a.manager.Add(backend.AddRequest{URL: payload.URL, Kind: "torrent", Browser: request.Source.Browser})
		if err != nil {
			response.Error = err.Error()
			break
		}
		response.OK = true
		response.Data = map[string]any{"downloadId": download.ID}
		a.showWindow() // bring Rivlet forward so the user sees the torrent was taken
	}
	if response.OK && request.Action != "health" && request.Action != "capture.download" && request.Action != "capture.torrent" {
		// The UI shows a small capture popup and brings the window up itself
		// (at popup size), so we don't pre-show the full-size window here.
		runtime.EventsEmit(a.ctx, "capturePrompt", add)
	}
	_ = capture.Write(conn, response)
}

func siteExcluded(raw string, patterns []string) bool {
	u, err := url.Parse(raw)
	if err != nil {
		return false
	}
	host := strings.ToLower(u.Hostname())
	for _, p := range patterns {
		p = strings.TrimPrefix(strings.ToLower(strings.TrimSpace(p)), "*.")
		if p != "" && (host == p || strings.HasSuffix(host, "."+p)) {
			return true
		}
	}
	return false
}
func captureAllowed(raw, name string, s backend.Settings) (bool, string) {
	if siteExcluded(raw, s.ExcludedSites) {
		return false, "This site is excluded by Rivlet settings"
	}
	ext := strings.TrimPrefix(strings.ToLower(filepath.Ext(name)), ".")
	if ext == "" {
		if u, err := url.Parse(raw); err == nil {
			ext = strings.TrimPrefix(strings.ToLower(filepath.Ext(u.Path)), ".")
		}
	}
	if len(s.CaptureFileTypes) > 0 && ext != "" {
		for _, allowed := range s.CaptureFileTypes {
			if strings.EqualFold(strings.TrimPrefix(allowed, "."), ext) {
				return true, ""
			}
		}
		return false, "This file type is not enabled for browser capture"
	}
	return true, ""
}

// beforeClose is invoked for every close request routed through the Wails
// runtime (including the custom title-bar close button, which calls
// runtime.Quit). Returning true prevents the shutdown; we hide the window to
// the tray instead. A real quit only happens once the tray "Quit" item has
// set a.quitting.
func (a *App) beforeClose(ctx context.Context) (preventClose bool) {
	if a.quitting {
		return false
	}
	runtime.WindowHide(ctx)
	return true
}

// trayReady wires up the system-tray icon and menu once its loop is running.
func (a *App) trayReady() {
	systray.SetIcon(trayIcon)
	systray.SetTitle("Rivlet")
	systray.SetTooltip("Rivlet — Download Manager")

	// Left / double click on the icon restores the window.
	systray.SetOnClick(func(systray.IMenu) { a.showWindow() })
	systray.SetOnDClick(func(systray.IMenu) { a.showWindow() })
	// Right click opens the menu (Windows default when no handler is set,
	// but we set it explicitly so the behaviour is consistent).
	systray.SetOnRClick(func(menu systray.IMenu) {
		if menu != nil {
			_ = menu.ShowMenu()
		}
	})

	mShow := systray.AddMenuItem("Show Rivlet", "Restore the Rivlet window")
	mShow.Click(a.showWindow)
	systray.AddSeparator()
	mQuit := systray.AddMenuItem("Quit Rivlet", "Exit the application")
	mQuit.Click(func() {
		a.quitting = true
		runtime.Quit(a.ctx)
	})
}

// showWindow brings the (possibly hidden or minimised) window back to front.
func (a *App) showWindow() {
	runtime.WindowShow(a.ctx)
	runtime.WindowUnminimise(a.ctx)
}
func (a *App) ListDownloads() []backend.Download                    { return a.manager.List() }
func (a *App) GetSettings() backend.Settings                        { return a.manager.GetSettings() }
func (a *App) NeedsBrowserOnboarding() bool                         { return a.manager.NeedsBrowserOnboarding() }
func (a *App) CompleteBrowserOnboarding() error                     { return a.manager.CompleteBrowserOnboarding() }
func (a *App) Add(req backend.AddRequest) (backend.Download, error) { return a.manager.Add(req) }
func (a *App) Pause(id string)                                      { a.manager.Pause(id) }
func (a *App) Resume(id string)                                     { a.manager.Resume(id) }
func (a *App) PauseAll()                                            { a.manager.PauseAll() }
func (a *App) ResumeAll()                                           { a.manager.ResumeAll() }
func (a *App) Cancel(id string)                                     { a.manager.Cancel(id) }
func (a *App) Remove(id string, deleteFile bool) error              { return a.manager.Remove(id, deleteFile) }
func (a *App) Retry(id string)                                      { a.manager.Retry(id) }
func (a *App) MoveToQueue(ids []string, queueID string) error {
	return a.manager.MoveToQueue(ids, queueID)
}
func (a *App) SetQueueRunning(queueID string, running bool) error {
	return a.manager.SetQueueRunning(queueID, running)
}
func (a *App) Reorder(ids []string) error                        { return a.manager.Reorder(ids) }
func (a *App) SetGlobalSpeedLimit(bps *int64) error              { return a.manager.SetGlobal(bps) }
func (a *App) SetDownloadSpeedLimit(id string, bps *int64) error { return a.manager.SetLimit(id, bps) }
func (a *App) ProbeVideo(url, browser, profile string) (backend.VideoInfo, error) {
	return backend.ProbeVideo(a.ctx, url, browser, profile)
}
func (a *App) ProbeURL(url, referrer string) (backend.UrlProbe, error) {
	return a.manager.ProbeURL(a.ctx, url, referrer)
}
func (a *App) SelectVideoFormat(id, formatID string) error {
	return a.manager.SelectVideoFormat(id, formatID)
}
func (a *App) AddTorrent(value string) (backend.Download, error) {
	return a.manager.Add(backend.AddRequest{URL: value, Kind: "torrent"})
}

// AddTorrentFile opens a file picker for a .torrent and queues it. Returns an
// empty download (no error) if the user cancels the dialog.
func (a *App) AddTorrentFile() (backend.Download, error) {
	path, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Choose a .torrent file",
		Filters: []runtime.FileFilter{
			{DisplayName: "Torrent files (*.torrent)", Pattern: "*.torrent"},
		},
	})
	if err != nil {
		return backend.Download{}, err
	}
	if path == "" {
		return backend.Download{}, nil // cancelled
	}
	return a.manager.AddTorrentFile(path)
}
func (a *App) OpenFile(id string) error   { return a.manager.Open(id, false) }
func (a *App) OpenFolder(id string) error { return a.manager.Open(id, true) }
func (a *App) CopyUrl(id string) error {
	v, e := a.manager.URL(id)
	if e != nil {
		return e
	}
	return runtime.ClipboardSetText(a.ctx, v)
}
func (a *App) PickFolder(currentPath string) (string, error) {
	return runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title:                "Choose a folder",
		DefaultDirectory:     currentPath,
		CanCreateDirectories: true,
	})
}
func (a *App) UpdateSettings(s backend.Settings) error  { return a.manager.UpdateSettings(s) }
func (a *App) ResetSettings() (backend.Settings, error) { return a.manager.ResetSettings() }
func (a *App) ExportDiagnostics() (string, error) {
	path, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{Title: "Export Rivlet diagnostics", DefaultFilename: "rivlet-diagnostics.json", Filters: []runtime.FileFilter{{DisplayName: "JSON files", Pattern: "*.json"}}})
	if err != nil || path == "" {
		return path, err
	}
	return path, a.manager.ExportDiagnostics(path)
}

// VideoToolsReady reports whether the extractor and merger are available.
func (a *App) VideoToolsReady() bool {
	return backend.HasYtDlp() && backend.HasFFmpeg()
}

// InstallVideoTools downloads yt-dlp into Rivlet's managed tools folder,
// emitting "videoToolsProgress" events so the UI can show a progress bar.
func (a *App) InstallVideoTools() error {
	_, err := backend.EnsureYtDlp(a.ctx, func(received, total int64) {
		runtime.EventsEmit(a.ctx, "videoToolsProgress", map[string]any{"received": received, "total": total})
	})
	if err != nil {
		return err
	}
	_, err = backend.EnsureFFmpeg(a.ctx, func(received, total int64) {
		runtime.EventsEmit(a.ctx, "videoToolsProgress", map[string]any{"received": received, "total": total})
	})
	return err
}
func (a *App) GetVideoToolsHealth() backend.VideoToolsHealth { return backend.VideoHealth() }
func (a *App) UpdateVideoTools() error                       { return backend.UpdateYtDlpSigned(a.ctx) }
func (a *App) RollbackVideoTools() error                     { return backend.RollbackYtDlp() }
