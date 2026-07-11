package main

import (
	"context"
	"os"
	"path/filepath"

	"github.com/energye/systray"
	"github.com/wailsapp/wails/v2/pkg/runtime"
	"idm-next/backend"
)

// App is the Wails adapter. Domain and engine logic live in backend.Manager.
type App struct {
	ctx      context.Context
	manager  *backend.Manager
	started  bool // true once startup completed, so restored state on load
	// (which does not emit) never triggers spurious notifications
	quitting bool // set when the user chooses Quit from the tray, so the
	// close is allowed through instead of hiding to the tray
}

func NewApp() *App { return &App{} }
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	dir, _ := os.UserConfigDir()
	a.manager, _ = backend.NewManager(filepath.Join(dir, "Grabby"), func(name string, payload any) {
		runtime.EventsEmit(ctx, name, payload)
		// A finished or failed download raises a native Windows notification.
		if a.started && name == "stateChange" {
			if d, ok := payload.(backend.Download); ok {
				notifyDownload(d)
			}
		}
	})
	a.started = true
	// System tray runs on its own message loop; keep Grabby alive when the
	// window is hidden and offer a way to restore or truly quit it.
	go systray.Run(a.trayReady, func() {})
}
func (a *App) shutdown(context.Context) {
	systray.Quit()
	if a.manager != nil {
		a.manager.Close()
	}
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
	systray.SetTitle("Grabby")
	systray.SetTooltip("Grabby — Download Manager")

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

	mShow := systray.AddMenuItem("Show Grabby", "Restore the Grabby window")
	mShow.Click(a.showWindow)
	systray.AddSeparator()
	mQuit := systray.AddMenuItem("Quit Grabby", "Exit the application")
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
func (a *App) Add(req backend.AddRequest) (backend.Download, error) { return a.manager.Add(req) }
func (a *App) Pause(id string)                                      { a.manager.Pause(id) }
func (a *App) Resume(id string)                                     { a.manager.Resume(id) }
func (a *App) PauseAll()                                            { a.manager.PauseAll() }
func (a *App) ResumeAll()                                           { a.manager.ResumeAll() }
func (a *App) Cancel(id string)                                     { a.manager.Cancel(id) }
func (a *App) Remove(id string, deleteFile bool) error              { return a.manager.Remove(id, deleteFile) }
func (a *App) Retry(id string)                                      { a.manager.Retry(id) }
func (a *App) Reorder(ids []string) error                           { return a.manager.Reorder(ids) }
func (a *App) SetGlobalSpeedLimit(bps *int64) error                 { return a.manager.SetGlobal(bps) }
func (a *App) SetDownloadSpeedLimit(id string, bps *int64) error    { return a.manager.SetLimit(id, bps) }
func (a *App) ProbeVideo(url string) (backend.VideoInfo, error) {
	return backend.ProbeVideo(a.ctx, url)
}
func (a *App) SelectVideoFormat(id, formatID string) error {
	return a.manager.SelectVideoFormat(id, formatID)
}
func (a *App) AddTorrent(value string) (backend.Download, error) {
	return a.manager.Add(backend.AddRequest{URL: value, Kind: "torrent"})
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
func (a *App) UpdateSettings(s backend.Settings) error { return a.manager.UpdateSettings(s) }
