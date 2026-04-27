package geartypes

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"github.com/jackc/pgx/v5"
	"github.com/studiocontrolroom/gearlist_backend/internal/httputil"
)

const (
	msgInvalidID     = "invalid id"
	msgInternalError = "internal error"
)

// GearTypeStore is the data access interface required by Handler.
type GearTypeStore interface {
	List(ctx context.Context) ([]GearType, error)
	Get(ctx context.Context, id TypeID) (GearType, error)
	Create(ctx context.Context, name, description, performedBy string) (GearType, error)
	Update(ctx context.Context, id TypeID, in UpdateInput, performedBy string) (GearType, error)
	SoftDelete(ctx context.Context, id TypeID, performedBy string) error
}

// Handler serves all /gear-types routes.
type Handler struct{ store GearTypeStore }

// NewHandler returns a Handler backed by store.
func NewHandler(store GearTypeStore) *Handler { return &Handler{store: store} }

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	switch {
	case r.Method == http.MethodGet && id == "":
		h.handleList(w, r)
	case r.Method == http.MethodGet:
		h.handleGet(w, r, id)
	case r.Method == http.MethodPost:
		h.handleCreate(w, r)
	case r.Method == http.MethodPatch:
		h.handleUpdate(w, r, id)
	case r.Method == http.MethodDelete:
		h.handleDelete(w, r, id)
	default:
		http.NotFound(w, r)
	}
}

func (h *Handler) handleList(w http.ResponseWriter, r *http.Request) {
	types, err := h.store.List(r.Context())
	if err != nil {
		slog.Error("gear-types list", "err", err)
		httputil.WriteError(w, http.StatusInternalServerError, msgInternalError)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, types)
}

func (h *Handler) handleGet(w http.ResponseWriter, r *http.Request, rawID string) {
	id, err := parseTypeID(rawID)
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, msgInvalidID)
		return
	}
	gt, err := h.store.Get(r.Context(), id)
	if errors.Is(err, pgx.ErrNoRows) {
		httputil.WriteError(w, http.StatusNotFound, "not found")
		return
	}
	if err != nil {
		slog.Error("gear-types get", "err", err)
		httputil.WriteError(w, http.StatusInternalServerError, msgInternalError)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, gt)
}

type createBody struct {
	TypeName        string `json:"type_name"`
	TypeDescription string `json:"type_description"`
}

func (h *Handler) handleCreate(w http.ResponseWriter, r *http.Request) {
	var body createBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if body.TypeName == "" {
		httputil.WriteError(w, http.StatusBadRequest, "type_name is required")
		return
	}
	gt, err := h.store.Create(r.Context(), body.TypeName, body.TypeDescription, httputil.UserFromRequest(r))
	if err != nil {
		slog.Error("gear-types create", "err", err)
		httputil.WriteError(w, http.StatusInternalServerError, msgInternalError)
		return
	}
	httputil.WriteJSON(w, http.StatusCreated, gt)
}

func (h *Handler) handleUpdate(w http.ResponseWriter, r *http.Request, rawID string) {
	id, err := parseTypeID(rawID)
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, msgInvalidID)
		return
	}
	var body map[string]string
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	in := buildUpdateInput(body)
	gt, err := h.store.Update(r.Context(), id, in, httputil.UserFromRequest(r))
	if errors.Is(err, pgx.ErrNoRows) {
		httputil.WriteError(w, http.StatusNotFound, "not found")
		return
	}
	if err != nil {
		slog.Error("gear-types update", "err", err)
		httputil.WriteError(w, http.StatusInternalServerError, msgInternalError)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, gt)
}

func (h *Handler) handleDelete(w http.ResponseWriter, r *http.Request, rawID string) {
	id, err := parseTypeID(rawID)
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, msgInvalidID)
		return
	}
	if err := h.store.SoftDelete(r.Context(), id, httputil.UserFromRequest(r)); err != nil {
		slog.Error("gear-types delete", "err", err)
		httputil.WriteError(w, http.StatusInternalServerError, msgInternalError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func parseTypeID(s string) (TypeID, error) {
	var id TypeID
	return id, id.Scan(s)
}

func buildUpdateInput(body map[string]string) UpdateInput {
	var in UpdateInput
	if v, ok := body["type_name"]; ok {
		in.Name = &v
	}
	if v, ok := body["type_description"]; ok {
		in.Description = &v
	}
	return in
}
