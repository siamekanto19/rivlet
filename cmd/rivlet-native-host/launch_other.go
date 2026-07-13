//go:build !windows

package main

import "errors"

func launchRivlet() error { return errors.New("automatic launch is currently Windows-only") }
