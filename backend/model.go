package backend

import "time"

type DownloadState string
type DownloadKind string

const (
	Queued     DownloadState = "queued"
	Connecting DownloadState = "connecting"
	Active     DownloadState = "active"
	Paused     DownloadState = "paused"
	Completed  DownloadState = "completed"
	Error      DownloadState = "error"
	Canceled   DownloadState = "canceled"
)

type SegmentProgress struct {
	Index int   `json:"index"`
	From  int64 `json:"from"`
	To    int64 `json:"to"`
	Done  int64 `json:"done"`
}
type VideoFormat struct {
	ID        string `json:"id"`
	Label     string `json:"label"`
	Ext       string `json:"ext"`
	SizeBytes *int64 `json:"sizeBytes"`
	HasVideo  bool   `json:"hasVideo"`
	HasAudio  bool   `json:"hasAudio"`
}
type VideoInfo struct {
	Title            string        `json:"title,omitempty"`
	Formats          []VideoFormat `json:"formats"`
	SelectedFormatID string        `json:"selectedFormatId,omitempty"`
}
type TorrentInfo struct {
	Peers   int     `json:"peers"`
	Seeders int     `json:"seeders"`
	Ratio   float64 `json:"ratio"`
}
type Download struct {
	ID               string            `json:"id"`
	URL              string            `json:"url"`
	Filename         string            `json:"filename"`
	DestinationPath  string            `json:"destinationPath"`
	Category         string            `json:"category"`
	Kind             DownloadKind      `json:"kind"`
	SizeBytes        *int64            `json:"sizeBytes"`
	DownloadedBytes  int64             `json:"downloadedBytes"`
	ProgressPct      float64           `json:"progressPct"`
	SpeedBps         int64             `json:"speedBps"`
	ETASeconds       *int64            `json:"etaSeconds"`
	SupportsResume   bool              `json:"supportsResume"`
	State            DownloadState     `json:"state"`
	Error            *string           `json:"error,omitempty"`
	DateAdded        string            `json:"dateAdded"`
	DateCompleted    *string           `json:"dateCompleted,omitempty"`
	Segments         []SegmentProgress `json:"segments,omitempty"`
	Video            *VideoInfo        `json:"video,omitempty"`
	Torrent          *TorrentInfo      `json:"torrent,omitempty"`
	Referrer         string            `json:"referrer,omitempty"`
	RequestUserAgent string            `json:"requestUserAgent,omitempty"`
	VideoFormatID    string            `json:"videoFormatId,omitempty"`
	BrowserProfile   string            `json:"browserProfile,omitempty"`
	Browser          string            `json:"browser,omitempty"`
}
type Category struct {
	ID         string   `json:"id"`
	Name       string   `json:"name"`
	Folder     string   `json:"folder"`
	Extensions []string `json:"extensions"`
}
type Schedule struct {
	Enabled   bool   `json:"enabled"`
	StartHHmm string `json:"startHHmm"`
	StopHHmm  string `json:"stopHHmm"`
}
type Settings struct {
	DownloadDir                    string     `json:"downloadDir"`
	MaxConcurrent                  int        `json:"maxConcurrent"`
	GlobalSpeedLimitBps            *int64     `json:"globalSpeedLimitBps"`
	Categories                     []Category `json:"categories"`
	ClipboardMonitoring            bool       `json:"clipboardMonitoring"`
	NotifyOnComplete               bool       `json:"notifyOnComplete"`
	ShutdownOnComplete             bool       `json:"shutdownOnComplete"`
	Schedule                       *Schedule  `json:"schedule"`
	SegmentCount                   int        `json:"segmentCount"`
	RetryCount                     int        `json:"retryCount"`
	RetryDelaySeconds              int        `json:"retryDelaySeconds"`
	RequestTimeoutSeconds          int        `json:"requestTimeoutSeconds"`
	UserAgent                      string     `json:"userAgent"`
	AutoResumeOnStartup            bool       `json:"autoResumeOnStartup"`
	OverwritePolicy                string     `json:"overwritePolicy"`
	RemoveCompleted                bool       `json:"removeCompleted"`
	ShowCompletionDialog           bool       `json:"showCompletionDialog"`
	TemporaryDir                   string     `json:"temporaryDir"`
	CaptureFileTypes               []string   `json:"captureFileTypes"`
	ExcludedSites                  []string   `json:"excludedSites"`
	VideoDetectionEnabled          bool       `json:"videoDetectionEnabled"`
	DisabledVideoSites             []string   `json:"disabledVideoSites"`
	PreferredVideoQuality          string     `json:"preferredVideoQuality"`
	PreferredVideoContainer        string     `json:"preferredVideoContainer"`
	ConcurrentFragments            int        `json:"concurrentFragments"`
	CookieBrowser                  string     `json:"cookieBrowser"`
	CookieProfile                  string     `json:"cookieProfile"`
	CookieConsent                  bool       `json:"cookieConsent"`
	BrowserOnboardingCompleted     bool       `json:"browserOnboardingCompleted"`
	ShowBrowserOnboardingOnStartup bool       `json:"showBrowserOnboardingOnStartup"`
}
type AddRequest struct {
	URL             string       `json:"url"`
	Filename        string       `json:"filename,omitempty"`
	DestinationPath string       `json:"destinationPath,omitempty"`
	Category        string       `json:"category,omitempty"`
	Kind            DownloadKind `json:"kind,omitempty"`
	Referrer        string       `json:"referrer,omitempty"`
	UserAgent       string       `json:"userAgent,omitempty"`
	VideoFormatID   string       `json:"videoFormatId,omitempty"`
	Browser         string       `json:"browser,omitempty"`
	BrowserProfile  string       `json:"browserProfile,omitempty"`
}

func NowISO() string { return time.Now().UTC().Format(time.RFC3339Nano) }
