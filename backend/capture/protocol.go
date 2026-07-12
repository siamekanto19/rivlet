package capture

import (
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/url"
	"strings"
)

const Version = 1
const MaxMessageSize = 256 * 1024

type Source struct {
	Browser          string `json:"browser"`
	ExtensionVersion string `json:"extensionVersion"`
}

type Envelope struct {
	Version int             `json:"version"`
	ID      string          `json:"id"`
	Action  string          `json:"action"`
	Source  Source          `json:"source"`
	Secret  string          `json:"secret,omitempty"`
	Payload json.RawMessage `json:"payload,omitempty"`
}

type Response struct {
	Version int    `json:"version"`
	ID      string `json:"id"`
	OK      bool   `json:"ok"`
	Error   string `json:"error,omitempty"`
	Data    any    `json:"data,omitempty"`
}

type LinkPayload struct {
	URL               string `json:"url"`
	PageURL           string `json:"pageUrl,omitempty"`
	SuggestedFilename string `json:"suggestedFilename,omitempty"`
	Referrer          string `json:"referrer,omitempty"`
	UserAgent         string `json:"userAgent,omitempty"`
	CookieHeader      string `json:"cookieHeader,omitempty"`
}

type MediaCandidate struct {
	URL  string `json:"url"`
	Kind string `json:"kind,omitempty"`
}

type VideoPayload struct {
	PageURL     string           `json:"pageUrl"`
	Title       string           `json:"title,omitempty"`
	PosterURL   string           `json:"posterUrl,omitempty"`
	Duration    float64          `json:"duration,omitempty"`
	DRMDetected bool             `json:"drmDetected"`
	UserAgent   string           `json:"userAgent,omitempty"`
	Candidates  []MediaCandidate `json:"candidates,omitempty"`
}

func Read(r io.Reader, value any) error {
	var header [4]byte
	if _, err := io.ReadFull(r, header[:]); err != nil {
		return err
	}
	size := binary.LittleEndian.Uint32(header[:])
	if size == 0 || size > MaxMessageSize {
		return fmt.Errorf("invalid message size %d", size)
	}
	b := make([]byte, size)
	if _, err := io.ReadFull(r, b); err != nil {
		return err
	}
	return json.Unmarshal(b, value)
}

func Write(w io.Writer, value any) error {
	b, err := json.Marshal(value)
	if err != nil {
		return err
	}
	if len(b) == 0 || len(b) > MaxMessageSize {
		return fmt.Errorf("message exceeds %d bytes", MaxMessageSize)
	}
	var header [4]byte
	binary.LittleEndian.PutUint32(header[:], uint32(len(b)))
	if _, err = w.Write(header[:]); err != nil {
		return err
	}
	_, err = w.Write(b)
	return err
}

func (e Envelope) Validate() error {
	if e.Version != Version {
		return errors.New("unsupported protocol version")
	}
	if len(e.ID) < 8 || len(e.ID) > 128 {
		return errors.New("invalid request id")
	}
	if e.Source.Browser != "chrome" && e.Source.Browser != "edge" && e.Action != "health" {
		return errors.New("unsupported browser")
	}
	switch e.Action {
	case "health", "capture.link", "capture.download", "capture.video", "capture.torrent":
	default:
		return errors.New("unsupported action")
	}
	return nil
}

// IsMagnet reports whether raw looks like a BitTorrent magnet URI.
func IsMagnet(raw string) bool {
	return strings.HasPrefix(strings.ToLower(strings.TrimSpace(raw)), "magnet:?")
}

func ValidateHTTPURL(raw string) error {
	u, err := url.Parse(raw)
	if err != nil {
		return errors.New("invalid URL")
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return errors.New("only HTTP(S) URLs are accepted")
	}
	if u.Host == "" {
		return errors.New("URL has no host")
	}
	return nil
}
