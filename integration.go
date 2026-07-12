package main

import (
	"os"
	"path/filepath"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// extensionID is derived from the fixed public key in the extension manifest,
// so it is stable across machines (and matches the native-messaging manifest
// the installer writes).
const extensionID = "iimckgccfcifkglbmdcghhfkdkbcbiib"

// BrowserInfo is a browser Grabby detected on this machine.
type BrowserInfo struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// BrowserIntegrationInfo is everything the "Connect your browser" flow needs.
type BrowserIntegrationInfo struct {
	ExtensionDir string        `json:"extensionDir"`
	ExtensionID  string        `json:"extensionId"`
	Connected    bool          `json:"connected"`
	Browsers     []BrowserInfo `json:"browsers"`
}

// extensionDir resolves the unpacked extension folder the user loads. In a
// packaged install that's <exeDir>\integration\extension; during `wails dev`
// it falls back to the repo's extension/dist.
func extensionDir() string {
	exe, err := os.Executable()
	if err == nil {
		cand := filepath.Join(filepath.Dir(exe), "integration", "extension")
		if st, e := os.Stat(cand); e == nil && st.IsDir() {
			return cand
		}
	}
	if wd, e := os.Getwd(); e == nil {
		cand := filepath.Join(wd, "extension", "dist")
		if st, e2 := os.Stat(cand); e2 == nil && st.IsDir() {
			return cand
		}
	}
	if err == nil {
		return filepath.Join(filepath.Dir(exe), "integration", "extension")
	}
	return filepath.Join("integration", "extension")
}

// GetBrowserIntegration reports the guided-install context to the UI.
func (a *App) GetBrowserIntegration() BrowserIntegrationInfo {
	a.captureMu.Lock()
	connected := a.browserConnected
	a.captureMu.Unlock()
	return BrowserIntegrationInfo{
		ExtensionDir: extensionDir(),
		ExtensionID:  extensionID,
		Connected:    connected,
		Browsers:     detectBrowsers(),
	}
}

// OpenBrowserExtensions opens the given browser's extensions page so the user
// can enable Developer mode and load Grabby's extension.
func (a *App) OpenBrowserExtensions(id string) error { return openBrowserExtensions(id) }

// OpenExtensionFolder reveals the unpacked extension folder in the file
// manager, so the user can pick it in the "Load unpacked" dialog.
func (a *App) OpenExtensionFolder() error { return openPath(extensionDir()) }

func (a *App) BeginBrowserSetup(id string) error {
	if err := runtime.ClipboardSetText(a.ctx, extensionDir()); err != nil {
		return err
	}
	if err := openBrowserExtensions(id); err != nil {
		return err
	}
	return openPath(extensionDir())
}
