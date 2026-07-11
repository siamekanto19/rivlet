//go:build windows

package main

import (
	"fmt"

	"golang.org/x/sys/windows/registry"
)

// readAccentPalette reads the 8-colour accent ramp Windows stores at
// HKCU\...\Explorer\Accent\AccentPalette. It is 32 bytes: 8 colours × RGBA,
// ordered lightest → darkest:
//
//	0 Light3  1 Light2  2 Light1  3 Accent  4 Dark1  5 Dark2  6 Dark3  7 (fixed)
func readAccentPalette() *AccentPalette {
	k, err := registry.OpenKey(
		registry.CURRENT_USER,
		`Software\Microsoft\Windows\CurrentVersion\Explorer\Accent`,
		registry.QUERY_VALUE,
	)
	if err != nil {
		return nil
	}
	defer k.Close()

	buf, _, err := k.GetBinaryValue("AccentPalette")
	if err != nil || len(buf) < 28 {
		return nil
	}
	hex := func(i int) string {
		o := i * 4
		return fmt.Sprintf("#%02x%02x%02x", buf[o], buf[o+1], buf[o+2])
	}
	return &AccentPalette{
		Light3: hex(0),
		Light2: hex(1),
		Light1: hex(2),
		Accent: hex(3),
		Dark1:  hex(4),
		Dark2:  hex(5),
		Dark3:  hex(6),
	}
}
