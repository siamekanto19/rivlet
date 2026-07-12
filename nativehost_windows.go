//go:build windows

package main

import (
	"encoding/json"
	"os"
	"path/filepath"

	"golang.org/x/sys/windows/registry"
)

const nativeHostName = "com.grabby.download_manager"

// nativeHostExe locates the native-messaging host executable: next to the
// installed app, or in build/bin during `wails dev`.
func nativeHostExe() (string, bool) {
	var cands []string
	if exe, err := os.Executable(); err == nil {
		dir := filepath.Dir(exe)
		cands = append(cands,
			filepath.Join(dir, "integration", "grabby-native-host.exe"),
			filepath.Join(dir, "grabby-native-host.exe"),
		)
	}
	if wd, err := os.Getwd(); err == nil {
		cands = append(cands, filepath.Join(wd, "build", "bin", "grabby-native-host.exe"))
	}
	for _, c := range cands {
		if st, err := os.Stat(c); err == nil && !st.IsDir() {
			return c, true
		}
	}
	return "", false
}

// registerNativeHost writes the native-messaging manifest and points the
// Chromium-based browsers at it, so the loaded extension can reach Grabby.
// It's best-effort and idempotent, and runs on every startup so it self-heals
// in dev and after the app is moved.
func registerNativeHost() {
	hostExe, ok := nativeHostExe()
	if !ok {
		return
	}
	cfgDir, err := os.UserConfigDir()
	if err != nil {
		return
	}
	dir := filepath.Join(cfgDir, "Grabby")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return
	}
	manifestPath := filepath.Join(dir, nativeHostName+".json")

	manifest := map[string]any{
		"name":            nativeHostName,
		"description":     "Grabby browser integration",
		"path":            hostExe,
		"type":            "stdio",
		"allowed_origins": []string{"chrome-extension://" + extensionID + "/"},
	}
	b, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return
	}
	if err := os.WriteFile(manifestPath, b, 0o644); err != nil {
		return
	}

	// HKCU native-messaging registration for the common Chromium browsers.
	for _, key := range []string{
		`Software\Google\Chrome\NativeMessagingHosts\` + nativeHostName,
		`Software\Microsoft\Edge\NativeMessagingHosts\` + nativeHostName,
		`Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\` + nativeHostName,
		`Software\Chromium\NativeMessagingHosts\` + nativeHostName,
	} {
		k, _, err := registry.CreateKey(registry.CURRENT_USER, key, registry.SET_VALUE)
		if err != nil {
			continue
		}
		_ = k.SetStringValue("", manifestPath)
		_ = k.Close()
	}
}
