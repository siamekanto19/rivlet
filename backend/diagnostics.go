package backend

import (
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"runtime"
	"strings"
)

type DiagnosticDownload struct {
	ID                string        `json:"id"`
	Host              string        `json:"host"`
	Filename          string        `json:"filename"`
	Kind              DownloadKind  `json:"kind"`
	State             DownloadState `json:"state"`
	ErrorCategory     string        `json:"errorCategory,omitempty"`
	SizeBytes         *int64        `json:"sizeBytes"`
	DownloadedBytes   int64         `json:"downloadedBytes"`
	HTTPVersion       string        `json:"httpVersion,omitempty"`
	DNSMillis         int64         `json:"dnsMillis,omitempty"`
	TLSMillis         int64         `json:"tlsMillis,omitempty"`
	TTFBMillis        int64         `json:"ttfbMillis,omitempty"`
	ReusedConnections int           `json:"reusedConnections,omitempty"`
	NewConnections    int           `json:"newConnections,omitempty"`
	QueueID           string        `json:"queueId,omitempty"`
}
type DiagnosticEvent struct {
	OccurredAt string `json:"occurredAt"`
	Level      string `json:"level"`
	Component  string `json:"component"`
	Event      string `json:"event"`
	Details    string `json:"details"`
}
type Diagnostics struct {
	GeneratedAt       string               `json:"generatedAt"`
	Platform          string               `json:"platform"`
	Architecture      string               `json:"architecture"`
	GoVersion         string               `json:"goVersion"`
	DatabaseIntegrity string               `json:"databaseIntegrity"`
	Settings          map[string]any       `json:"settings"`
	Downloads         []DiagnosticDownload `json:"downloads"`
	Events            []DiagnosticEvent    `json:"events"`
	ToolVersions      map[string]string    `json:"toolVersions"`
}

func safeHost(raw string) string {
	u, err := url.Parse(raw)
	if err != nil {
		return "invalid"
	}
	return strings.ToLower(u.Hostname())
}
func (m *Manager) recordDiagnostic(level, component, event, details string) {
	if m.db == nil {
		return
	}
	details = redactDiagnosticText(details)
	_, _ = m.db.Exec(`INSERT INTO diagnostic_events(occurred_at,level,component,event,details) VALUES(?,?,?,?,?)`, NowISO(), level, component, event, details)
}
func redactDiagnosticText(v string) string {
	for _, marker := range []string{"authorization:", "cookie:", "proxy-authorization:"} {
		if i := strings.Index(strings.ToLower(v), marker); i >= 0 {
			end := strings.IndexByte(v[i:], '\n')
			if end < 0 {
				end = len(v) - i
			}
			v = v[:i] + marker + " [REDACTED]" + v[i+end:]
		}
	}
	return v
}
func (m *Manager) ExportDiagnostics(path string) error {
	m.mu.RLock()
	settings := clone(m.settings)
	downloads := make([]DiagnosticDownload, 0, len(m.downloads))
	for _, id := range m.order {
		if d := m.downloads[id]; d != nil {
			downloads = append(downloads, DiagnosticDownload{ID: d.ID, Host: safeHost(d.URL), Filename: d.Filename, Kind: d.Kind, State: d.State, ErrorCategory: d.ErrorCategory, SizeBytes: d.SizeBytes, DownloadedBytes: d.DownloadedBytes, HTTPVersion: d.HTTPVersion, DNSMillis: d.DNSMillis, TLSMillis: d.TLSMillis, TTFBMillis: d.TTFBMillis, ReusedConnections: d.ReusedConnections, NewConnections: d.NewConnections, QueueID: d.QueueID})
		}
	}
	m.mu.RUnlock()
	sanitized := map[string]any{"maxConcurrent": settings.MaxConcurrent, "segmentCount": settings.SegmentCount, "retryCount": settings.RetryCount, "requestTimeoutSeconds": settings.RequestTimeoutSeconds, "autoResumeOnStartup": settings.AutoResumeOnStartup, "overwritePolicy": settings.OverwritePolicy, "queueCount": len(settings.Queues), "categoryCount": len(settings.Categories), "videoDetectionEnabled": settings.VideoDetectionEnabled, "preferredVideoQuality": settings.PreferredVideoQuality, "preferredVideoContainer": settings.PreferredVideoContainer}
	d := Diagnostics{GeneratedAt: NowISO(), Platform: runtime.GOOS, Architecture: runtime.GOARCH, GoVersion: runtime.Version(), Settings: sanitized, Downloads: downloads, ToolVersions: map[string]string{}}
	if err := m.db.QueryRow(`PRAGMA quick_check`).Scan(&d.DatabaseIntegrity); err != nil {
		d.DatabaseIntegrity = err.Error()
	}
	rows, err := m.db.Query(`SELECT occurred_at,level,component,event,details FROM diagnostic_events ORDER BY id DESC LIMIT 500`)
	if err == nil {
		for rows.Next() {
			var e DiagnosticEvent
			if rows.Scan(&e.OccurredAt, &e.Level, &e.Component, &e.Event, &e.Details) == nil {
				d.Events = append(d.Events, e)
			}
		}
		rows.Close()
	}
	toolRows, err := m.db.Query(`SELECT tool,version FROM tool_versions`)
	if err == nil {
		for toolRows.Next() {
			var k, v string
			if toolRows.Scan(&k, &v) == nil {
				d.ToolVersions[k] = v
			}
		}
		toolRows.Close()
	}
	b, err := json.MarshalIndent(d, "", "  ")
	if err != nil {
		return err
	}
	if err = os.WriteFile(path, b, 0600); err != nil {
		return fmt.Errorf("write diagnostics: %w", err)
	}
	return nil
}
