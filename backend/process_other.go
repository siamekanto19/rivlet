//go:build !windows

package backend

import "os/exec"

func hideProcessWindow(*exec.Cmd) {}
