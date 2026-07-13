package main

import (
	_ "embed"
	"os"
	"path/filepath"
	"sync"

	toast "git.sr.ht/~jackmordaunt/go-toast/v2"
	"rivlet/backend"
)

// appID is the identity Windows shows in the toast and in Action Center.
const appID = "Rivlet"

// appIconPNG is the Rivlet icon, reused for toast notifications. go-toast needs
// an on-disk image path, so we extract it once to a temp file.
//
//go:embed build/appicon.png
var appIconPNG []byte

var (
	iconOnce sync.Once
	iconPath string
)

func notifyIconPath() string {
	iconOnce.Do(func() {
		p := filepath.Join(os.TempDir(), "rivlet-icon.png")
		if err := os.WriteFile(p, appIconPNG, 0o644); err == nil {
			iconPath = p
		}
	})
	return iconPath
}

// notifyDownload fires a native Windows toast when a download finishes or
// fails. Any other state is ignored. Push() can block on its PowerShell
// fallback, so it runs detached.
func notifyDownload(d backend.Download) {
	var title, body string
	switch d.State {
	case backend.Completed:
		title = "Download complete"
		body = d.Filename
	case backend.Error:
		title = "Download failed"
		if d.Error != nil && *d.Error != "" {
			body = d.Filename + " — " + *d.Error
		} else {
			body = d.Filename
		}
	default:
		return
	}

	n := toast.Notification{
		AppID: appID,
		Title: title,
		Body:  body,
		Icon:  notifyIconPath(),
	}
	go func() { _ = n.Push() }()
}
