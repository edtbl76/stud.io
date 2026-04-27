package gear

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"mime"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/studiocontrolroom/gearlist_backend/internal/httputil"
)

// GearStore is the data access interface required by Handler.
type GearStore interface {
	List(ctx context.Context, f ListFilter) (ListResult, error)
	Get(ctx context.Context, id GearID) (GearView, error)
	Create(ctx context.Context, in CreateInput, performedBy string) (GearView, error)
	Update(ctx context.Context, id GearID, in UpdateInput, performedBy string) (GearView, error)
	SoftDelete(ctx context.Context, id GearID, performedBy string) error
	SetPhotoKey(ctx context.Context, id GearID, key, performedBy string) error
	History(ctx context.Context, id GearID) ([]AuditRow, error)
}

// PhotoUploader uploads and removes gear photos in object storage.
type PhotoUploader interface {
	Upload(ctx context.Context, gearID, contentType string, r http.Request) (string, error)
	Delete(ctx context.Context, key string) error
}

// routeKey identifies a handler by HTTP method and URL suffix.
type routeKey struct{ method, suffix string }

// Handler serves all /gear routes via an internal dispatch table.
type Handler struct {
	store  GearStore
	photos PhotoUploader // nil when storage is not configured
	routes map[routeKey]http.HandlerFunc
}

// NewHandler returns a Handler backed by store. Pass nil for photos to disable
// photo upload (returns 503 when the endpoint is called).
func NewHandler(store GearStore) *Handler {
	h := &Handler{store: store}
	h.routes = map[routeKey]http.HandlerFunc{
		{http.MethodGet, ""}:        h.handleList,
		{http.MethodPost, ""}:       h.handleCreate,
		{http.MethodGet, "id"}:      h.handleGet,
		{http.MethodPatch, "id"}:    h.handleUpdate,
		{http.MethodDelete, "id"}:   h.handleDelete,
		{http.MethodGet, "history"}: h.handleHistory,
		{http.MethodPost, "photo"}:  h.handlePhoto,
	}
	return h
}

// WithPhotos attaches a PhotoUploader to the handler.
func (h *Handler) WithPhotos(p PhotoUploader) *Handler {
	h.photos = p
	return h
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	fn, ok := h.routes[routeKey{r.Method, routeSuffix(r)}]
	if !ok {
		http.NotFound(w, r)
		return
	}
	fn(w, r)
}

// internalError logs err and writes a 500 response.
func internalError(w http.ResponseWriter, label string, err error) {
	slog.Error(label, "err", err)
	httputil.WriteError(w, http.StatusInternalServerError, "internal error")
}

// routeSuffix returns the dispatch key suffix: the last path segment when it
// is a known keyword ("history", "photo"), "id" when an {id} wildcard is set,
// or "" for collection routes.
func routeSuffix(r *http.Request) string {
	last := r.URL.Path[strings.LastIndex(r.URL.Path, "/")+1:]
	switch last {
	case "history", "photo":
		return last
	}
	if r.PathValue("id") != "" {
		return "id"
	}
	return ""
}

// ── handlers ──────────────────────────────────────────────────────────────────

func (h *Handler) handleList(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	limit := parseIntOr(q.Get("limit"), 100)
	offset := parseIntOr(q.Get("offset"), 0)
	if limit < 0 {
		httputil.WriteError(w, http.StatusBadRequest, "limit must be non-negative")
		return
	}
	if offset < 0 {
		httputil.WriteError(w, http.StatusBadRequest, "offset must be non-negative")
		return
	}
	typeID, err := parseOptionalUUID(q.Get("type_id"))
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid type_id")
		return
	}
	result, err := h.store.List(r.Context(), ListFilter{
		Name: q.Get("name"), Limit: limit, Offset: offset, TypeID: typeID,
	})
	if err != nil {
		internalError(w, "gear list", err)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, result)
}

func (h *Handler) handleGet(w http.ResponseWriter, r *http.Request) {
	id, ok := resolveID(w, r)
	if !ok {
		return
	}
	gv, err := h.store.Get(r.Context(), id)
	if errors.Is(err, pgx.ErrNoRows) {
		httputil.WriteError(w, http.StatusNotFound, "not found")
		return
	}
	if err != nil {
		internalError(w, "gear get", err)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, gv)
}

func (h *Handler) handleCreate(w http.ResponseWriter, r *http.Request) {
	var in CreateInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if in.GearName == "" {
		httputil.WriteError(w, http.StatusBadRequest, "gear_name is required")
		return
	}
	gv, err := h.store.Create(r.Context(), in, httputil.UserFromRequest(r))
	if err != nil {
		internalError(w, "gear create", err)
		return
	}
	httputil.WriteJSON(w, http.StatusCreated, gv)
}

func (h *Handler) handleUpdate(w http.ResponseWriter, r *http.Request) {
	id, ok := resolveID(w, r)
	if !ok {
		return
	}
	var in UpdateInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	gv, err := h.store.Update(r.Context(), id, in, httputil.UserFromRequest(r))
	if errors.Is(err, pgx.ErrNoRows) {
		httputil.WriteError(w, http.StatusNotFound, "not found")
		return
	}
	if err != nil {
		internalError(w, "gear update", err)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, gv)
}

func (h *Handler) handleDelete(w http.ResponseWriter, r *http.Request) {
	id, ok := resolveID(w, r)
	if !ok {
		return
	}
	if err := h.store.SoftDelete(r.Context(), id, httputil.UserFromRequest(r)); err != nil {
		internalError(w, "gear delete", err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) handleHistory(w http.ResponseWriter, r *http.Request) {
	id, ok := resolveID(w, r)
	if !ok {
		return
	}
	entries, err := h.store.History(r.Context(), id)
	if err != nil {
		internalError(w, "gear history", err)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, entries)
}

func (h *Handler) handlePhoto(w http.ResponseWriter, r *http.Request) {
	if h.photos == nil {
		httputil.WriteError(w, http.StatusServiceUnavailable, "photo storage not configured")
		return
	}
	id, ok := resolveID(w, r)
	if !ok {
		return
	}
	mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || !IsAllowedPhotoType(mediaType) {
		httputil.WriteError(w, http.StatusUnsupportedMediaType, "unsupported media type; allowed: image/jpeg, image/png, image/webp")
		return
	}
	key, err := h.photos.Upload(r.Context(), id.String(), mediaType, *r)
	if errors.Is(err, ErrPhotoTooLarge) {
		httputil.WriteError(w, http.StatusRequestEntityTooLarge, "photo exceeds 10 MB limit")
		return
	}
	if err != nil {
		internalError(w, "gear photo upload", err)
		return
	}
	if err := h.store.SetPhotoKey(r.Context(), id, key, httputil.UserFromRequest(r)); err != nil {
		cleanupPhoto(r.Context(), h.photos, key)
		internalError(w, "gear set photo key", err)
		return
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]string{"photo_key": key})
}

// cleanupPhoto removes a successfully uploaded object when the subsequent DB
// write fails, preventing orphaned objects in storage.
func cleanupPhoto(ctx context.Context, photos PhotoUploader, key string) {
	if err := photos.Delete(ctx, key); err != nil {
		slog.Error("gear photo cleanup", "err", err)
	}
}

// ── helpers ───────────────────────────────────────────────────────────────────

func parseGearID(s string) (GearID, error) {
	var id GearID
	return id, id.Scan(s)
}

// parseOptionalUUID parses a UUID query param. Empty string returns nil, nil.
// A non-empty but invalid value returns a non-nil error.
func parseOptionalUUID(s string) (*GearID, error) {
	if s == "" {
		return nil, nil
	}
	id, err := parseGearID(s)
	if err != nil {
		return nil, err
	}
	return &id, nil
}

// resolveID parses the {id} path value, writing 400 and returning false on failure.
func resolveID(w http.ResponseWriter, r *http.Request) (GearID, bool) {
	id, err := parseGearID(r.PathValue("id"))
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid id")
		return GearID{}, false
	}
	return id, true
}

func parseIntOr(s string, fallback int) int {
	if s == "" {
		return fallback
	}
	var n int
	if _, err := fmt.Sscanf(s, "%d", &n); err != nil {
		return fallback
	}
	return n
}
