package providers

import (
	"context"
	"crypto/tls"
	"net/http"
)

// HTTPChecker implements HTTPHealthChecker using a standard HTTP client.
// TLS verification is disabled because the local stack uses self-signed certs.
type HTTPChecker struct {
	client *http.Client
}

// NewHTTPChecker creates an HTTPChecker.
func NewHTTPChecker() *HTTPChecker {
	return &HTTPChecker{
		client: &http.Client{
			Transport: &http.Transport{
				TLSClientConfig: &tls.Config{InsecureSkipVerify: true}, //nolint:gosec // local dev only
			},
		},
	}
}

func (h *HTTPChecker) IsReachable(ctx context.Context, url string) (bool, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return false, err
	}
	resp, err := h.client.Do(req)
	if err != nil {
		return false, nil // not ready yet — connection refused or similar
	}
	defer resp.Body.Close()
	return resp.StatusCode >= 200 && resp.StatusCode < 300, nil
}
