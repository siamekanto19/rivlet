//go:build windows

package main

import (
	"errors"
	"os/exec"

	"golang.org/x/sys/windows/registry"
)

// appPath returns the install path of an executable via the Windows
// "App Paths" registry entries (how the shell resolves e.g. "chrome.exe").
func appPath(exe string) (string, bool) {
	for _, root := range []registry.Key{registry.CURRENT_USER, registry.LOCAL_MACHINE} {
		k, err := registry.OpenKey(root, `Software\Microsoft\Windows\CurrentVersion\App Paths\`+exe, registry.QUERY_VALUE)
		if err != nil {
			continue
		}
		v, _, e := k.GetStringValue("")
		k.Close()
		if e == nil && v != "" {
			return v, true
		}
	}
	return "", false
}

type browserDef struct {
	id, name, exe, scheme string
}

var browserDefs = []browserDef{
	{"chrome", "Google Chrome", "chrome.exe", "chrome"},
	{"edge", "Microsoft Edge", "msedge.exe", "edge"},
	{"brave", "Brave", "brave.exe", "brave"},
	{"vivaldi", "Vivaldi", "vivaldi.exe", "vivaldi"},
	{"opera", "Opera", "opera.exe", "opera"},
}

func detectBrowsers() []BrowserInfo {
	out := []BrowserInfo{}
	for _, d := range browserDefs {
		if _, ok := appPath(d.exe); ok {
			out = append(out, BrowserInfo{ID: d.id, Name: d.name})
		}
	}
	return out
}

// extensionsURL is the internal address of a browser's extensions manager.
func extensionsURL(d browserDef) string {
	if d.id == "opera" {
		// Opera hides its extensions manager behind a different address.
		return "opera://extensions"
	}
	return d.scheme + "://extensions/"
}

func openBrowserExtensions(id string) error {
	for _, d := range browserDefs {
		if d.id != id {
			continue
		}
		path, ok := appPath(d.exe)
		if !ok {
			return errors.New(d.name + " is not installed")
		}
		// Pass the internal URL as a bare positional argument — no extra
		// switches. Chromium's process-singleton forwards a clean command line
		// to an already-running instance and opens the page in a new tab;
		// stray unknown switches (e.g. "--new-tab", which isn't a real
		// Chromium flag) cause the URL to be dropped on that forwarding path.
		return exec.Command(path, extensionsURL(d)).Start()
	}
	return errors.New("unknown browser")
}

func openPath(path string) error {
	return exec.Command("explorer.exe", path).Start()
}
