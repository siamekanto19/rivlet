//go:build windows

package main

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
)

func launchGrabby() error {
	candidates := []string{os.Getenv("GRABBY_APP_PATH")}
	if exe, err := os.Executable(); err == nil {
		hostDir := filepath.Dir(exe)
		candidates = append(candidates,
			filepath.Join(hostDir, "Grabify.exe"),
			filepath.Join(hostDir, "Grabby.exe"),
			// Installed layout: <Grabby>\integration\grabby-native-host.exe
			filepath.Join(filepath.Dir(hostDir), "Grabify.exe"),
			filepath.Join(filepath.Dir(hostDir), "Grabby.exe"),
		)
	}
	if local := os.Getenv("LOCALAPPDATA"); local != "" {
		candidates = append(candidates, filepath.Join(local, "Programs", "Grabify", "Grabify.exe"))
		candidates = append(candidates, filepath.Join(local, "Programs", "Grabby", "Grabby.exe"))
	}
	if pf := os.Getenv("ProgramFiles"); pf != "" {
		candidates = append(candidates, filepath.Join(pf, "Grabify", "Grabify.exe"))
		candidates = append(candidates, filepath.Join(pf, "Grabby", "Grabby.exe"))
	}
	for _, path := range candidates {
		if path == "" {
			continue
		}
		if _, err := os.Stat(path); err == nil {
			cmd := exec.Command(path, "--from-extension")
			cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
			return cmd.Start()
		}
	}
	return errors.New("Grabify.exe was not found")
}
