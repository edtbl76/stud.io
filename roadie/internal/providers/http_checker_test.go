package providers

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHTTPChecker_IsReachable_2xx(t *testing.T) {
	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	checker := &HTTPChecker{client: srv.Client()}
	ok, err := checker.IsReachable(context.Background(), srv.URL)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !ok {
		t.Error("expected IsReachable=true for 200 response")
	}
}

func TestHTTPChecker_IsReachable_5xx(t *testing.T) {
	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	checker := &HTTPChecker{client: srv.Client()}
	ok, err := checker.IsReachable(context.Background(), srv.URL)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ok {
		t.Error("expected IsReachable=false for 500 response")
	}
}

func TestHTTPChecker_IsReachable_ConnectionRefused(t *testing.T) {
	checker := NewHTTPChecker()
	ok, err := checker.IsReachable(context.Background(), "https://127.0.0.1:1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ok {
		t.Error("expected IsReachable=false for refused connection")
	}
}
