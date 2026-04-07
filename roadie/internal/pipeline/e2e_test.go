package pipeline

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestWaitForHTTP_SucceedsOnFirstResponse(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	if err := waitForHTTP(context.Background(), srv.URL, 3, 10*time.Millisecond); err != nil {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestWaitForHTTP_FailsAfterMaxAttempts(t *testing.T) {
	// Use a URL that returns 503 so all attempts fail.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer srv.Close()

	err := waitForHTTP(context.Background(), srv.URL, 3, time.Millisecond)
	if err == nil {
		t.Fatal("expected error after max attempts, got nil")
	}
}

func TestWaitForHTTP_RespectsContextCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel() // cancel immediately

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	// Cancelled context should not block indefinitely.
	done := make(chan error, 1)
	go func() {
		done <- waitForHTTP(ctx, srv.URL, 5, time.Second)
	}()

	select {
	case <-done:
		// OK — returned quickly
	case <-time.After(2 * time.Second):
		t.Fatal("waitForHTTP blocked despite cancelled context")
	}
}

func TestE2EConfig_ZeroValue(t *testing.T) {
	cfg := E2EConfig{}
	if cfg.Shards != 0 {
		t.Errorf("expected zero shards by default, got %d", cfg.Shards)
	}
}
