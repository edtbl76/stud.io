package maintenance

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/studiocontrolroom/gearlist_backend/internal/httputil"
)

// MaintenanceStore is the data access interface required by Handler.
type MaintenanceStore interface {
	List(ctx context.Context, gearID pgtype.UUID) ([]LogEntry, error)
	Create(ctx context.Context, gearID pgtype.UUID, in CreateInput) (LogEntry, error)
}

// Handler serves GET and POST /gear/{id}/maintenance.
type Handler struct{ store MaintenanceStore }

// NewHandler returns a Handler backed by store.
func NewHandler(store MaintenanceStore) *Handler { return &Handler{store: store} }

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r.PathValue("id"))
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid id")
		return
	}
	switch r.Method {
	case http.MethodGet:
		h.handleList(w, r, id)
	case http.MethodPost:
		h.handleCreate(w, r, id)
	default:
		http.NotFound(w, r)
	}
}

func (h *Handler) handleList(w http.ResponseWriter, r *http.Request, id pgtype.UUID) {
	entries, err := h.store.List(r.Context(), id)
	if err != nil {
		slog.Error("maintenance list", "err", err)
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, entries)
}

type createBody struct {
	EventType string `json:"event_type"`
	Notes     string `json:"notes"`
	EventDate string `json:"event_date"` // "YYYY-MM-DD"
}

func (h *Handler) handleCreate(w http.ResponseWriter, r *http.Request, id pgtype.UUID) {
	var body createBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if body.EventType == "" {
		httputil.WriteError(w, http.StatusBadRequest, "event_type is required")
		return
	}
	date, err := time.Parse("2006-01-02", body.EventDate)
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "event_date must be YYYY-MM-DD")
		return
	}
	entry, err := h.store.Create(r.Context(), id, CreateInput{
		EventType: body.EventType,
		Notes:     body.Notes,
		EventDate: date,
	})
	if err != nil {
		slog.Error("maintenance create", "err", err)
		httputil.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}
	httputil.WriteJSON(w, http.StatusCreated, entry)
}

func parseID(s string) (pgtype.UUID, error) {
	var id pgtype.UUID
	return id, id.Scan(s)
}
