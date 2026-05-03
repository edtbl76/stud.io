package health

import (
	"context"
	"encoding/json"
	"net/http"
	"time"
)

// Pinger is satisfied by *pgxpool.Pool.
type Pinger interface {
	Ping(ctx context.Context) error
}

// Handler responds to GET /health. Returns 200 {"status":"ok"} when the
// database is reachable, 503 {"status":"degraded"} otherwise.
type Handler struct {
	db Pinger
}

func NewHandler(db Pinger) *Handler {
	return &Handler{db: db}
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()

	status, code := "ok", http.StatusOK
	if err := h.db.Ping(ctx); err != nil {
		status, code = "degraded", http.StatusServiceUnavailable
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"status": status}) // #nosec G104 -- ResponseWriter write errors are not actionable
}
