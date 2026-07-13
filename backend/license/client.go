package license

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

// defaultAPIBase is the licensing backend base URL — the deployed Worker.
// Overridable with RIVLET_LICENSE_API (e.g. for local `wrangler dev`). Switch
// to the custom domain (api.rivlet.pro) once it's mapped to the Worker.
// Keep the existing Worker endpoint until api.rivlet.pro is connected to this
// Cloudflare account. The public product and checkout URLs use rivlet.pro.
const defaultAPIBase = "https://grabify-licensing.siamekanto.workers.dev"

// APIError is a structured error returned by the licensing backend. Its Code is
// stable and machine-readable so the UI can react (e.g. offer device management
// on "device_limit_reached").
type APIError struct {
	Status  int    `json:"-"`
	Code    string `json:"code"`
	Message string `json:"message"`
}

func (e *APIError) Error() string {
	if e.Message != "" {
		return e.Message
	}
	if e.Code != "" {
		return e.Code
	}
	return fmt.Sprintf("license server error (HTTP %d)", e.Status)
}

// Common API error codes surfaced to the UI.
const (
	CodeDeviceLimitReached = "device_limit_reached"
	CodeLicenseNotFound    = "license_not_found"
	CodeLicenseRevoked     = "license_revoked"
	CodeDeviceNotFound     = "device_not_found"
	CodeRateLimited        = "rate_limited"
)

// Device is one activation slot on a license.
type Device struct {
	DeviceID    string `json:"deviceId"`
	Name        string `json:"name"`
	ActivatedAt string `json:"activatedAt"`
	LastSeenAt  string `json:"lastSeenAt,omitempty"`
	Current     bool   `json:"current,omitempty"` // filled in client-side
}

type activateResponse struct {
	Token   string   `json:"token"`
	Devices []Device `json:"devices,omitempty"`
}

type devicesResponse struct {
	Devices []Device `json:"devices"`
}

// Client talks to the Rivlet licensing backend.
type Client struct {
	baseURL string
	http    *http.Client
}

// NewClient builds a client against the configured backend (env override or the
// production default).
func NewClient() *Client {
	base := strings.TrimRight(strings.TrimSpace(os.Getenv("RIVLET_LICENSE_API")), "/")
	if base == "" {
		base = strings.TrimRight(strings.TrimSpace(os.Getenv("GRABIFY_LICENSE_API")), "/")
	}
	if base == "" {
		base = defaultAPIBase
	}
	return &Client{
		baseURL: base,
		http:    &http.Client{Timeout: 20 * time.Second},
	}
}

// Configured reports whether a usable backend URL is set. (Always true given the
// default, but kept explicit for readability at call sites.)
func (c *Client) Configured() bool { return c.baseURL != "" }

func (c *Client) post(ctx context.Context, path string, body any, out any) error {
	payload, err := json.Marshal(body)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+path, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("could not reach the licensing server: %w", err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		apiErr := &APIError{Status: resp.StatusCode}
		var envelope struct {
			Error *APIError `json:"error"`
		}
		if json.Unmarshal(raw, &envelope) == nil && envelope.Error != nil {
			apiErr.Code = envelope.Error.Code
			apiErr.Message = envelope.Error.Message
		}
		if apiErr.Message == "" {
			apiErr.Message = fmt.Sprintf("the licensing server rejected the request (HTTP %d)", resp.StatusCode)
		}
		return apiErr
	}
	if out != nil && len(raw) > 0 {
		if err := json.Unmarshal(raw, out); err != nil {
			return fmt.Errorf("unexpected response from the licensing server: %w", err)
		}
	}
	return nil
}

// Activate binds this device to a license key and returns a freshly signed
// entitlement certificate.
func (c *Client) Activate(ctx context.Context, licenseKey, deviceID, deviceName string) (string, []Device, error) {
	var out activateResponse
	err := c.post(ctx, "/v1/activate", map[string]string{
		"licenseKey": licenseKey,
		"deviceId":   deviceID,
		"deviceName": deviceName,
	}, &out)
	if err != nil {
		return "", nil, err
	}
	if out.Token == "" {
		return "", nil, errors.New("the licensing server did not return a certificate")
	}
	return out.Token, out.Devices, nil
}

// Refresh re-issues the entitlement certificate for an already-activated device,
// extending the offline validation window and reflecting any status change
// (e.g. a refund).
func (c *Client) Refresh(ctx context.Context, licenseKey, deviceID string) (string, error) {
	var out activateResponse
	err := c.post(ctx, "/v1/refresh", map[string]string{
		"licenseKey": licenseKey,
		"deviceId":   deviceID,
	}, &out)
	if err != nil {
		return "", err
	}
	if out.Token == "" {
		return "", errors.New("the licensing server did not return a certificate")
	}
	return out.Token, nil
}

// Deactivate releases a device slot. targetDeviceID may be this device or
// another one listed on the license (self-service device management).
func (c *Client) Deactivate(ctx context.Context, licenseKey, deviceID, targetDeviceID string) error {
	return c.post(ctx, "/v1/deactivate", map[string]string{
		"licenseKey":     licenseKey,
		"deviceId":       deviceID,
		"targetDeviceId": targetDeviceID,
	}, nil)
}

// Devices lists the devices currently activated on the license.
func (c *Client) Devices(ctx context.Context, licenseKey, deviceID string) ([]Device, error) {
	var out devicesResponse
	if err := c.post(ctx, "/v1/devices", map[string]string{
		"licenseKey": licenseKey,
		"deviceId":   deviceID,
	}, &out); err != nil {
		return nil, err
	}
	return out.Devices, nil
}

// Recover asks the backend to email the license key(s) associated with an email
// address. The response never reveals whether the address has a license.
func (c *Client) Recover(ctx context.Context, email string) error {
	return c.post(ctx, "/v1/recover", map[string]string{"email": email}, nil)
}
