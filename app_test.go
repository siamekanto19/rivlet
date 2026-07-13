package main

import (
	"rivlet/backend"
	"testing"
)

func TestCaptureRules(t *testing.T) {
	s := backend.Settings{CaptureFileTypes: []string{"zip", "pdf"}, ExcludedSites: []string{"*.private.test"}}
	if ok, _ := captureAllowed("https://cdn.example.test/file.zip", "", s); !ok {
		t.Fatal("zip should be captured")
	}
	if ok, _ := captureAllowed("https://cdn.example.test/file.exe", "", s); ok {
		t.Fatal("exe should be rejected")
	}
	if ok, _ := captureAllowed("https://assets.private.test/file.zip", "", s); ok {
		t.Fatal("excluded subdomain should be rejected")
	}
	if siteExcluded("https://notprivate.test/x", s.ExcludedSites) {
		t.Fatal("suffix attack matched")
	}
}
