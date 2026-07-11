//go:build !windows

package main

// Non-Windows builds have no system accent to read; the UI falls back to its
// built-in accent.
func readAccentPalette() *AccentPalette { return nil }
