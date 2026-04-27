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
	"github.com/studiocontrolroom/gearlist_backend/internal/gear"
	"github.com/studiocontrolroom/gearlist_backend/internal/geartypes"
	"github.com/studiocontrolroom/gearlist_backend/internal/health"
	"github.com/studiocontrolroom/gearlist_backend/internal/httputil"
	"github.com/studiocontrolroom/gearlist_backend/internal/maintenance"
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

	dbCtx, dbCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer dbCancel()
	pool, err := db.Open(dbCtx, cfg.DSN())
	if err != nil {
		return fmt.Errorf("db: %w", err)
	}
	defer pool.Close()

	photos, err := gear.NewPhotoUploader(cfg.MinioEndpoint, cfg.MinioAccessKey, cfg.MinioSecretKey, cfg.MinioBucket)
	if err != nil {
		return fmt.Errorf("photo uploader: %w", err)
	}

	gtHandler := geartypes.NewHandler(geartypes.NewStore(pool))
	gearHandler := gear.NewHandler(gear.NewStore(pool))
	if photos != nil {
		gearHandler = gearHandler.WithPhotos(photos)
	}
	maintHandler := maintenance.NewHandler(maintenance.NewStore(pool))

	mux := http.NewServeMux()
	mux.Handle("GET /health", health.NewHandler(pool))
	registerRoutes(mux, gtHandler, gearHandler, maintHandler)

	return serve(server.New(cfg.Addr(), mux))
}

// serve starts srv and blocks until it exits or an OS signal is received.
func serve(srv *server.Server) error {
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	srvErr := make(chan error, 1)
	go func() {
		if err := srv.Start(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			srvErr <- err
		}
	}()

	select {
	case err := <-srvErr:
		return fmt.Errorf("server: %w", err)
	case <-quit:
		slog.Info("shutting down")
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		return srv.Shutdown(ctx)
	}
}

func registerRoutes(mux *http.ServeMux, gt *geartypes.Handler, g *gear.Handler, m *maintenance.Handler) {
	admin := func(h http.Handler) http.Handler { return httputil.RequireRole("admin", h) }

	mux.Handle("GET /gear-types", gt)
	mux.Handle("POST /gear-types", admin(gt))
	mux.Handle("GET /gear-types/{id}", gt)
	mux.Handle("PATCH /gear-types/{id}", admin(gt))
	mux.Handle("DELETE /gear-types/{id}", admin(gt))

	// /gear/{id}/history and /gear/{id}/photo must be registered before /gear/{id}
	// so the mux picks the more specific pattern first.
	mux.Handle("GET /gear/{id}/history", g)
	mux.Handle("POST /gear/{id}/photo", admin(g))
	mux.Handle("GET /gear/{id}/maintenance", m)
	mux.Handle("POST /gear/{id}/maintenance", admin(m))

	mux.Handle("GET /gear", g)
	mux.Handle("POST /gear", admin(g))
	mux.Handle("GET /gear/{id}", g)
	mux.Handle("PATCH /gear/{id}", admin(g))
	mux.Handle("DELETE /gear/{id}", admin(g))
}
