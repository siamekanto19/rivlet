package main

import (
	"context"
	"os"
	"path/filepath"

	"github.com/wailsapp/wails/v2/pkg/runtime"
	"idm-next/backend"
)

// App is the Wails adapter. Domain and engine logic live in backend.Manager.
type App struct {
	ctx     context.Context
	manager *backend.Manager
}

func NewApp() *App { return &App{} }
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	dir, _ := os.UserConfigDir()
	a.manager, _ = backend.NewManager(filepath.Join(dir, "IDM-next"), func(name string, payload any) { runtime.EventsEmit(ctx, name, payload) })
}
func (a *App) shutdown(context.Context) {
	if a.manager != nil {
		a.manager.Close()
	}
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
