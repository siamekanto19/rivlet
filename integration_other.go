//go:build !windows

package main

import "errors"

func detectBrowsers() []BrowserInfo { return []BrowserInfo{} }

func openBrowserExtensions(string) error { return errors.New("unsupported on this platform") }

func openPath(string) error { return errors.New("unsupported on this platform") }
