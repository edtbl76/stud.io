package main

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"

	"github.com/studiocontrolroom/plugin_scanner/internal/config"
	"github.com/studiocontrolroom/plugin_scanner/internal/metadata"
	"github.com/studiocontrolroom/plugin_scanner/internal/scanner"
)

func TestValidateScanConfig_MissingAPIKey_NonDryRun(t *testing.T) {
	cfg := &config.Config{ServerURL: "https://example.com"}
	if err := validateScanConfig(cfg, false); err == nil {
		t.Fatal("expected error for missing API key")
	}
}

func TestValidateScanConfig_MissingServerURL_NonDryRun(t *testing.T) {
	cfg := &config.Config{APIKey: "psc_key"}
	err := validateScanConfig(cfg, false)
	if err == nil {
		t.Fatal("expected error for missing server URL")
	}
	if !strings.Contains(err.Error(), "server URL") {
		t.Errorf("expected error to mention server URL, got: %v", err)
	}
}

func TestValidateScanConfig_BothSet_NonDryRun(t *testing.T) {
	cfg := &config.Config{APIKey: "psc_key", ServerURL: "https://example.com"}
	if err := validateScanConfig(cfg, false); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestValidateScanConfig_BothEmpty_DryRun(t *testing.T) {
	cfg := &config.Config{}
	if err := validateScanConfig(cfg, true); err != nil {
		t.Fatalf("unexpected error in dry-run mode: %v", err)
	}
}

func TestFetchAndFilterExclusions_NoServer_ReturnsFullList(t *testing.T) {
	discovered := []metadata.DiscoveredPlugin{{Name: "A", Vendor: "V"}}
	kept, excluded := fetchAndFilterExclusions(t.Context(), &config.Config{}, discovered)
	if !reflect.DeepEqual(kept, discovered) {
		t.Fatalf("expected kept to equal discovered, got %+v", kept)
	}
	if excluded != nil {
		t.Errorf("expected nil excluded, got %v", excluded)
	}
}

func TestFetchAndFilterExclusions_FetchFailure_FallsBackToFullList(t *testing.T) {
	// 401 is a terminal error — GetExclusions fails fast without retry delay.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
	}))
	defer srv.Close()

	discovered := []metadata.DiscoveredPlugin{{Name: "A", Vendor: "V"}, {Name: "B", Vendor: "V"}}
	cfg := &config.Config{ServerURL: srv.URL, APIKey: "psc_test"}

	kept, excluded := fetchAndFilterExclusions(t.Context(), cfg, discovered)
	if !reflect.DeepEqual(kept, discovered) {
		t.Fatalf("expected kept to equal discovered on fetch failure, got %+v", kept)
	}
	if excluded != nil {
		t.Errorf("expected nil excluded on fetch failure, got %v", excluded)
	}
}

func TestUploadScan_PrintUploadDone_NotCalledOnError(t *testing.T) {
	// Use 401 to avoid the retry backoff delay (401 is a terminal, non-retryable error).
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
	}))
	defer srv.Close()

	var buf bytes.Buffer
	s := scanner.New(&buf, true, false)
	run := &scanner.ScanRun{}
	p := uploadParams{
		ctx: t.Context(),
		cfg: &config.Config{ServerURL: srv.URL, APIKey: "psc_test"},
	}

	err := uploadScan(s, run, p)
	if err == nil {
		t.Fatal("expected error from 401 response")
	}
	if buf.Len() > 0 {
		t.Errorf("PrintUploadDone must not be called when PostScan returns an error, got: %q", buf.String())
	}
}
