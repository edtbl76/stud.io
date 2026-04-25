package server

import (
	"context"
	"net/http"
	"testing"
	"time"
)

func TestServerStartsAndShutsDown(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	srv := New(":0", mux)

	errCh := make(chan error, 1)
	go func() { errCh <- srv.Start() }()

	// Give the server a moment to bind.
	time.Sleep(10 * time.Millisecond)

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		t.Fatalf("Shutdown(): %v", err)
	}
}
