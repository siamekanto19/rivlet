//go:build windows

package backend

import (
	"fmt"
	"os/exec"
)

func systemPowerAction(action string) error {
	var cmd *exec.Cmd
	switch action {
	case "shutdown":
		cmd = exec.Command("shutdown.exe", "/s", "/t", "30", "/d", "p:0:0")
	case "hibernate":
		cmd = exec.Command("shutdown.exe", "/h")
	case "sleep":
		cmd = exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-Command", "Suspend-Computer")
	default:
		return fmt.Errorf("unsupported completion action %q", action)
	}
	hideProcessWindow(cmd)
	return cmd.Start()
}
