package server

import (
	"context"
	"log/slog"
	"net/http"
	"time"
)

const (
	readTimeout  = 5 * time.Second
	writeTimeout = 10 * time.Second
	idleTimeout  = 60 * time.Second
)

// Server wraps net/http.Server with structured logging and graceful shutdown.
type Server struct {
	inner *http.Server
}

func New(addr string, mux http.Handler) *Server {
	return &Server{
		inner: &http.Server{
			Addr:         addr,
			Handler:      mux,
			ReadTimeout:  readTimeout,
			WriteTimeout: writeTimeout,
			IdleTimeout:  idleTimeout,
		},
	}
}

// Start begins accepting connections. It blocks until the server closes.
func (s *Server) Start() error {
	slog.Info("gearlist_backend listening", "addr", s.inner.Addr)
	return s.inner.ListenAndServe()
}

// Shutdown gracefully drains active connections within the given context deadline.
func (s *Server) Shutdown(ctx context.Context) error {
	return s.inner.Shutdown(ctx)
}
