package client

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/studiocontrolroom/plugin_scanner/internal/metadata"
)

func newTestClient(t *testing.T, handler http.HandlerFunc) (*APIClient, *httptest.Server) {
	t.Helper()
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)
	c := NewAPIClient(srv.URL, "test-key", nil, nil)
	return c, srv
}

// clientOp is a uniform operation type used by shared retry/error assertion helpers.
type clientOp func(c *APIClient, ctx context.Context) error

// assertRetryBehavior verifies the retry and terminal-error contract for any client operation.
// codes: HTTP status codes to test; wantAttempts: expected number of server hits; errFragment:
// substring that must appear in the error when non-empty.
func assertRetryBehavior(t *testing.T, codes []int, wantAttempts int, errFragment string, op clientOp) {
	t.Helper()
	orig := retryBackoff
	retryBackoff = []time.Duration{time.Millisecond, time.Millisecond, time.Millisecond}
	defer func() { retryBackoff = orig }()

	for _, code := range codes {
		code := code
		t.Run(fmt.Sprintf("%d", code), func(t *testing.T) {
			attempts := 0
			c, _ := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
				attempts++
				w.WriteHeader(code)
			})
			err := op(c, context.Background())
			if err == nil {
				t.Fatalf("expected error on %d", code)
			}
			if errFragment != "" && !strings.Contains(err.Error(), errFragment) {
				t.Errorf("expected error containing %q, got: %v", errFragment, err)
			}
			if attempts != wantAttempts {
				t.Errorf("expected %d attempts on %d, got %d", wantAttempts, code, attempts)
			}
		})
	}
}

func TestPostScan_SuccessReturnsSummary(t *testing.T) {
	c, _ := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer test-key" {
			t.Error("missing or wrong Authorization header")
		}
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"known":1,"unlinked":4,"orphaned":0,"needs_review":2,"excluded":1}`)
	})

	plugins := []metadata.DiscoveredPlugin{{Name: "Synth", Format: "vst3"}}
	got, err := c.PostScan(context.Background(), plugins, "test-mac")
	if err != nil {
		t.Fatal(err)
	}
	if got.Unlinked != 4 {
		t.Errorf("expected Unlinked=4, got %d", got.Unlinked)
	}
	if got.NeedsReview != 2 {
		t.Errorf("expected NeedsReview=2, got %d", got.NeedsReview)
	}
}

func TestPostScan_401_NoRetry(t *testing.T) {
	postScan := func(c *APIClient, ctx context.Context) error { _, err := c.PostScan(ctx, nil, "mac"); return err }
	assertRetryBehavior(t, []int{http.StatusUnauthorized}, 1, "invalid or revoked", postScan)
}

func TestPostScan_4xx_NoRetry(t *testing.T) {
	postScan := func(c *APIClient, ctx context.Context) error { _, err := c.PostScan(ctx, nil, "mac"); return err }
	assertRetryBehavior(t, []int{400, 403, 404, 422}, 1, "", postScan)
}

func TestPostScan_5xx_Retries(t *testing.T) {
	postScan := func(c *APIClient, ctx context.Context) error { _, err := c.PostScan(ctx, nil, "mac"); return err }
	assertRetryBehavior(t, []int{http.StatusInternalServerError}, maxRetries, "", postScan)
}

func TestPostScan_ContextCancellation(t *testing.T) {
	orig := retryBackoff
	retryBackoff = []time.Duration{time.Millisecond, time.Millisecond, time.Millisecond}
	defer func() { retryBackoff = orig }()
	c, _ := newTestClient(t, func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusInternalServerError) })
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
	if err == nil {
		t.Fatal("expected error from 500 response")
	}
	if strings.Contains(err.Error(), "test-key") {
		t.Error("API key must not appear in error message")
	}
}

func TestPostScan_IdempotencyKeyConsistentAcrossRetries(t *testing.T) {
	var keys []string
	orig := retryBackoff
	retryBackoff = []time.Duration{time.Millisecond, time.Millisecond, time.Millisecond}
	defer func() { retryBackoff = orig }()

	c, _ := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		keys = append(keys, r.Header.Get("X-Idempotency-Key"))
		w.WriteHeader(http.StatusInternalServerError)
	})

	c.PostScan(context.Background(), nil, "mac") //nolint:errcheck

	if len(keys) != maxRetries {
		t.Fatalf("expected %d attempts, got %d", maxRetries, len(keys))
	}
	if keys[0] == "" {
		t.Fatal("X-Idempotency-Key header must not be empty")
	}
	for i, k := range keys[1:] {
		if k != keys[0] {
			t.Errorf("attempt %d idempotency key %q differs from attempt 0 key %q", i+1, k, keys[0])
		}
	}
}

// ---------------------------------------------------------------------------
// GetExclusions
// ---------------------------------------------------------------------------

func TestGetExclusions_SuccessReturnsParsedExclusions(t *testing.T) {
	c, _ := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `[{"vendor":"Waves","name":"SSL","format":"vst3"},{"vendor":"FabFilter","name":"Pro-Q","format":"component"}]`)
	})

	got, err := c.GetExclusions(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 {
		t.Fatalf("expected 2 exclusions, got %d", len(got))
	}
	if got[0].Vendor != "Waves" || got[0].Name != "SSL" {
		t.Errorf("unexpected first exclusion: %+v", got[0])
	}
	if got[1].Vendor != "FabFilter" || got[1].Name != "Pro-Q" {
		t.Errorf("unexpected second exclusion: %+v", got[1])
	}
}

func TestGetExclusions_EmptyArray_ReturnsEmpty(t *testing.T) {
	c, _ := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `[]`)
	})

	got, err := c.GetExclusions(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if got == nil {
		t.Error("expected non-nil empty slice, got nil")
	}
	if len(got) != 0 {
		t.Errorf("expected empty slice, got %d elements", len(got))
	}
}

func TestGetExclusions_401_NoRetry(t *testing.T) {
	getExcl := func(c *APIClient, ctx context.Context) error { _, err := c.GetExclusions(ctx); return err }
	assertRetryBehavior(t, []int{http.StatusUnauthorized}, 1, "invalid or revoked", getExcl)
}

func TestGetExclusions_4xx_NoRetry(t *testing.T) {
	getExcl := func(c *APIClient, ctx context.Context) error { _, err := c.GetExclusions(ctx); return err }
	assertRetryBehavior(t, []int{400, 403, 404, 422}, 1, "", getExcl)
}

func TestGetExclusions_5xx_Retries(t *testing.T) {
	getExcl := func(c *APIClient, ctx context.Context) error { _, err := c.GetExclusions(ctx); return err }
	assertRetryBehavior(t, []int{http.StatusInternalServerError}, maxRetries, "", getExcl)
}

func TestGetExclusions_ContextCancellation(t *testing.T) {
	orig := retryBackoff
	retryBackoff = []time.Duration{time.Millisecond, time.Millisecond, time.Millisecond}
	defer func() { retryBackoff = orig }()
	c, _ := newTestClient(t, func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusInternalServerError) })
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err := c.GetExclusions(ctx)
	if err == nil {
		t.Fatal("expected error on cancelled context")
	}
}

func TestGetExclusions_BearerTokenSet(t *testing.T) {
	var gotAuth string
	c, _ := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `[]`)
	})

	if _, err := c.GetExclusions(context.Background()); err != nil {
		t.Fatal(err)
	}
	if gotAuth != "Bearer test-key" {
		t.Errorf("expected Authorization: Bearer test-key, got %q", gotAuth)
	}
}

func TestGetExclusions_FormatFieldDiscarded(t *testing.T) {
	c, _ := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `[{"exclusion_id":"abc","vendor":"Waves","name":"SSL","format":"vst3","excluded_at":"2026-01-01","excluded_by":"user@example.com"}]`)
	})

	got, err := c.GetExclusions(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 {
		t.Fatalf("expected 1 exclusion, got %d", len(got))
	}
	if got[0].Vendor != "Waves" || got[0].Name != "SSL" {
		t.Errorf("unexpected exclusion: %+v", got[0])
	}
}

func TestBuildPayload_MetadataSourceIncluded(t *testing.T) {
	plugins := []metadata.DiscoveredPlugin{
		{Name: "P", Vendor: "V", Format: "vst3", MetadataSource: "moduleinfo.json"},
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
	plugins := []metadata.DiscoveredPlugin{{Name: "P", Format: "vst3", MetadataSource: ""}}
	payload := buildPayload(plugins, "mac")
	if payload.Plugins[0].MetadataSource != nil {
		t.Error("empty MetadataSource should be omitted from payload")
	}
}
