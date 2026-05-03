package client

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/studiocontrolroom/plugin_scanner/internal/metadata"
	"github.com/studiocontrolroom/plugin_scanner/internal/scanner"
)

const perAttemptTimeout = 30 * time.Second
const maxRetries = 3

var retryBackoff = []time.Duration{time.Second, 2 * time.Second, 4 * time.Second}

// ScanPayload is the JSON body sent to POST /scanner/scan.
type ScanPayload struct {
	Plugins       []pluginDTO `json:"plugins"`
	SourceMachine string      `json:"source_machine"`
}

type pluginDTO struct {
	Name           string  `json:"name"`
	Vendor         string  `json:"vendor"`
	Version        string  `json:"version"`
	Format         string  `json:"format"`
	Path           string  `json:"path"`
	MetadataSource *string `json:"metadata_source,omitempty"`
}

// APIClient uploads scan results to the ControlRoom scanner API.
type APIClient struct {
	serverURL  string
	apiKey     string
	httpClient *http.Client
	progress   progressFunc
}

type progressFunc func(current, total int)

// NewAPIClient creates an APIClient with retry and custom TLS.
func NewAPIClient(serverURL, apiKey string, tlsCfg *tls.Config, progress progressFunc) *APIClient {
	transport := &http.Transport{TLSClientConfig: tlsCfg}
	return &APIClient{
		serverURL:  serverURL,
		apiKey:     apiKey,
		httpClient: &http.Client{Transport: transport},
		progress:   progress,
	}
}

// PostScan uploads discovered plugins and returns the server summary.
func (c *APIClient) PostScan(ctx context.Context, plugins []metadata.DiscoveredPlugin, sourceMachine string) (*scanner.ServerSummary, error) {
	body, err := json.Marshal(buildPayload(plugins, sourceMachine))
	if err != nil {
		return nil, fmt.Errorf("marshalling payload: %w", err)
	}
	summary, err := c.postWithRetry(ctx, body, newUUID())
	if err != nil {
		return nil, err
	}
	if c.progress != nil {
		c.progress(len(plugins), len(plugins))
	}
	return summary, nil
}

func (c *APIClient) postWithRetry(ctx context.Context, body []byte, idempotencyKey string) (*scanner.ServerSummary, error) {
	var lastErr error
	for attempt := 0; attempt < maxRetries; attempt++ {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		if err := waitBackoff(ctx, attempt); err != nil {
			return nil, err
		}
		summary, err := c.doPost(ctx, body, idempotencyKey)
		if err == nil {
			return summary, nil
		}
		if isTerminalError(err) {
			return nil, err
		}
		lastErr = err
	}
	return nil, fmt.Errorf("upload failed after %d attempts: %w", maxRetries, lastErr)
}

func waitBackoff(ctx context.Context, attempt int) error {
	if attempt == 0 {
		return nil
	}
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-time.After(retryBackoff[attempt-1]):
		return nil
	}
}

func (c *APIClient) doPost(ctx context.Context, body []byte, idempotencyKey string) (*scanner.ServerSummary, error) {
	attemptCtx, cancel := context.WithTimeout(ctx, perAttemptTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(attemptCtx, http.MethodPost,
		c.serverURL+"/scanner/scan", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("X-Idempotency-Key", idempotencyKey)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if err := checkStatus(resp); err != nil {
		return nil, err
	}

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("reading response: %w", err)
	}
	return decodeBody(data)
}

func checkStatus(resp *http.Response) error {
	switch {
	case resp.StatusCode == http.StatusUnauthorized:
		return &authError{}
	case resp.StatusCode >= 400 && resp.StatusCode < 500:
		return &clientError{code: resp.StatusCode}
	case resp.StatusCode >= 500:
		return fmt.Errorf("server error: %d", resp.StatusCode)
	case resp.StatusCode != http.StatusOK:
		return fmt.Errorf("unexpected status: %d", resp.StatusCode)
	default:
		return nil
	}
}

func decodeBody(data []byte) (*scanner.ServerSummary, error) {
	var summary scanner.ServerSummary
	if err := json.Unmarshal(data, &summary); err != nil {
		return nil, fmt.Errorf("decoding response: %w", err)
	}
	return &summary, nil
}

func buildPayload(plugins []metadata.DiscoveredPlugin, machine string) ScanPayload {
	dtos := make([]pluginDTO, len(plugins))
	for i, p := range plugins {
		dto := pluginDTO{
			Name: p.Name, Vendor: p.Vendor, Version: p.Version,
			Format: p.Format, Path: p.Path,
		}
		if p.MetadataSource != "" {
			s := p.MetadataSource
			dto.MetadataSource = &s
		}
		dtos[i] = dto
	}
	return ScanPayload{Plugins: dtos, SourceMachine: machine}
}

// authError signals a 401 — not retried.
type authError struct{}

func (e *authError) Error() string { return "API key is invalid or revoked" }

// clientError signals any other 4xx — not retried.
type clientError struct{ code int }

func (e *clientError) Error() string { return fmt.Sprintf("client error: %d", e.code) }

func isTerminalError(err error) bool {
	switch err.(type) {
	case *authError, *clientError:
		return true
	}
	return false
}

func newUUID() string {
	var b [16]byte
	_, _ = rand.Read(b[:])
	b[6] = (b[6] & 0x0f) | 0x40 // version 4
	b[8] = (b[8] & 0x3f) | 0x80 // variant bits
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}
