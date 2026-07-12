//go:build !windows

package backend

import "fmt"

func systemPowerAction(action string) error {
	return fmt.Errorf("power action %q is only supported on Windows", action)
}
