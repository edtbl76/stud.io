package client

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/studiocontrolroom/plugin_scanner/internal/metadata"
	"github.com/studiocontrolroom/plugin_scanner/internal/scanner"
)

func newTestClient(t *testing.T, handler http.HandlerFunc) (*APIClient, *httptest.Server) {
	t.Helper()
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)
	c := NewAPIClient(srv.URL, "test-key", nil, nil)
	return c, srv
}

func TestPostScan_SuccessReturnsSummary(t *testing.T) {
	summary := scanner.ServerSummary{Matched: 3, Untracked: 1}
	c, _ := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer test-key" {
			t.Error("missing or wrong Authorization header")
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(summary)
	})

	plugins := []metadata.DiscoveredPlugin{{Name: "Synth", Format: "VST3"}}
	got, err := c.PostScan(context.Background(), plugins, "test-mac")
	if err != nil {
		t.Fatal(err)
	}
	if got.Matched != 3 || got.Untracked != 1 {
		t.Errorf("unexpected summary: %+v", got)
	}
}

func TestPostScan_401_NoRetry(t *testing.T) {
	attempts := 0
	c, _ := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		attempts++
		w.WriteHeader(http.StatusUnauthorized)
	})

	_, err := c.PostScan(context.Background(), nil, "mac")
	if err == nil {
		t.Fatal("expected error on 401")
	}
	if !strings.Contains(err.Error(), "invalid or revoked") {
		t.Errorf("unexpected error: %v", err)
	}
	if attempts != 1 {
		t.Errorf("expected 1 attempt on 401, got %d", attempts)
	}
}

func TestPostScan_5xx_Retries(t *testing.T) {
	attempts := 0
	// Override backoff for test speed.
	orig := retryBackoff
	retryBackoff = []time.Duration{time.Millisecond, time.Millisecond, time.Millisecond}
	defer func() { retryBackoff = orig }()

	c, _ := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		attempts++
		w.WriteHeader(http.StatusInternalServerError)
	})

	_, err := c.PostScan(context.Background(), nil, "mac")
	if err == nil {
		t.Fatal("expected error after retries")
	}
	if attempts != maxRetries {
		t.Errorf("expected %d attempts, got %d", maxRetries, attempts)
	}
}

func TestPostScan_ContextCancellation(t *testing.T) {
	orig := retryBackoff
	retryBackoff = []time.Duration{time.Millisecond, time.Millisecond, time.Millisecond}
	defer func() { retryBackoff = orig }()

	c, _ := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	})

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	_, err := c.PostScan(ctx, nil, "mac")
	if err == nil {
		t.Fatal("expected error on cancelled context")
	}
}

func TestPostScan_APIKeyNotInErrorMessage(t *testing.T) {
	c, _ := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	})

	orig := retryBackoff
	retryBackoff = []time.Duration{time.Millisecond, time.Millisecond, time.Millisecond}
	defer func() { retryBackoff = orig }()

	_, err := c.PostScan(context.Background(), nil, "mac")
	if err != nil && strings.Contains(err.Error(), "test-key") {
		t.Error("API key must not appear in error message")
	}
}

func TestBuildPayload_MetadataSourceIncluded(t *testing.T) {
	plugins := []metadata.DiscoveredPlugin{
		{Name: "P", Vendor: "V", Format: "VST3", MetadataSource: "moduleinfo.json"},
	}
	payload := buildPayload(plugins, "mac")
	if payload.Plugins[0].MetadataSource == nil {
		t.Error("MetadataSource should be set")
	}
	if *payload.Plugins[0].MetadataSource != "moduleinfo.json" {
		t.Errorf("unexpected MetadataSource: %v", *payload.Plugins[0].MetadataSource)
	}
}

func TestBuildPayload_EmptyMetadataSourceOmitted(t *testing.T) {
	plugins := []metadata.DiscoveredPlugin{{Name: "P", Format: "VST3", MetadataSource: ""}}
	payload := buildPayload(plugins, "mac")
	if payload.Plugins[0].MetadataSource != nil {
		t.Error("empty MetadataSource should be omitted from payload")
	}
}
