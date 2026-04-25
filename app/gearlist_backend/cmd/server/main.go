package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/studiocontrolroom/gearlist_backend/internal/config"
	"github.com/studiocontrolroom/gearlist_backend/internal/db"
	"github.com/studiocontrolroom/gearlist_backend/internal/health"
	"github.com/studiocontrolroom/gearlist_backend/internal/server"
)

func main() {
	if err := run(); err != nil {
		slog.Error("startup failed", "err", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("config: %w", err)
	}

	pool, err := db.Open(context.Background(), cfg.DSN())
	if err != nil {
		return fmt.Errorf("db: %w", err)
	}
	defer pool.Close()

	mux := http.NewServeMux()
	mux.Handle("GET /health", health.NewHandler(pool))
	// Phase 4: GearList routes registered here.

	srv := server.New(cfg.Addr(), mux)

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		if err := srv.Start(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("server error", "err", err)
			os.Exit(1)
		}
	}()

	<-quit
	slog.Info("shutting down")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return srv.Shutdown(ctx)
}
