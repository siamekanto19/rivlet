//go:build !windows

package main

import "errors"

func launchGrabby() error { return errors.New("automatic launch is currently Windows-only") }
