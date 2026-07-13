//go:build windows

package main

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
)

func launchRivlet() error {
	candidates := []string{os.Getenv("RIVLET_APP_PATH")}
	if exe, err := os.Executable(); err == nil {
		hostDir := filepath.Dir(exe)
		candidates = append(candidates,
			filepath.Join(hostDir, "Rivlet.exe"),
			filepath.Join(hostDir, "Rivlet-dev.exe"),
			// Installed layout: <Rivlet>\integration\rivlet-native-host.exe
			filepath.Join(filepath.Dir(hostDir), "Rivlet.exe"),
			filepath.Join(filepath.Dir(hostDir), "Rivlet-dev.exe"),
		)
	}
	if local := os.Getenv("LOCALAPPDATA"); local != "" {
		candidates = append(candidates, filepath.Join(local, "Programs", "Rivlet", "Rivlet.exe"))
	}
	if pf := os.Getenv("ProgramFiles"); pf != "" {
		candidates = append(candidates, filepath.Join(pf, "Rivlet", "Rivlet.exe"))
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
	return errors.New("Rivlet.exe was not found")
}
