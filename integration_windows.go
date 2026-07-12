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

func openBrowserExtensions(id string) error {
	for _, d := range browserDefs {
		if d.id != id {
			continue
		}
		path, ok := appPath(d.exe)
		if !ok {
			return errors.New(d.name + " is not installed")
		}
		// Opera hides an extensions manager behind a different URL; the others
		// use <scheme>://extensions/.
		url := d.scheme + "://extensions/"
		if id == "opera" {
			url = "opera://extensions"
		}
		return exec.Command(path, "--new-tab", url).Start()
	}
	return errors.New("unknown browser")
}

func openPath(path string) error {
	return exec.Command("explorer.exe", path).Start()
}
