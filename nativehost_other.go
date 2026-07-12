//go:build !windows

package main

// Native-messaging host registration is Windows-only for now.
func registerNativeHost() {}
