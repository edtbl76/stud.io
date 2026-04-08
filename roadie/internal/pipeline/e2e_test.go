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
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer srv.Close()

	err := waitForHTTP(context.Background(), srv.URL, 3, time.Millisecond)
	if err == nil {
		t.Fatal("expected error after max attempts, got nil")
	}
}

func TestWaitForHTTP_RejectsNon2xx(t *testing.T) {
	// 4xx responses must not be treated as healthy (regression guard for the
	// previous < 500 condition that accepted 404/401 as "ready").
	for _, code := range []int{301, 400, 401, 403, 404} {
		code := code
		t.Run(http.StatusText(code), func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(code)
			}))
			defer srv.Close()

			err := waitForHTTP(context.Background(), srv.URL, 2, time.Millisecond)
			if err == nil {
				t.Errorf("status %d should not be treated as healthy", code)
			}
		})
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

func TestValidateDBIdentifier(t *testing.T) {
	valid := []string{
		"controlroomdb_test",
		"controlroomdb_test_0",
		"studio",
		"_private",
		"A",
	}
	for _, name := range valid {
		if err := validateDBIdentifier(name); err != nil {
			t.Errorf("validateDBIdentifier(%q): unexpected error: %v", name, err)
		}
	}

	invalid := []string{
		"",
		"123bad",
		"has space",
		"has-dash",
		"has'quote",
		"has;semi",
		"has\"double",
		"$bad",
	}
	for _, name := range invalid {
		if err := validateDBIdentifier(name); err == nil {
			t.Errorf("validateDBIdentifier(%q): expected error, got nil", name)
		}
	}
}
