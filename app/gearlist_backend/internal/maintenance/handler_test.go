package maintenance_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/studiocontrolroom/gearlist_backend/internal/maintenance"
)

type stubStore struct {
	listFn   func(context.Context, pgtype.UUID) ([]maintenance.LogEntry, error)
	createFn func(context.Context, pgtype.UUID, maintenance.CreateInput) (maintenance.LogEntry, error)
}

func (s *stubStore) List(ctx context.Context, id pgtype.UUID) ([]maintenance.LogEntry, error) {
	return s.listFn(ctx, id)
}
func (s *stubStore) Create(ctx context.Context, id pgtype.UUID, in maintenance.CreateInput) (maintenance.LogEntry, error) {
	return s.createFn(ctx, id, in)
}

func fixedEntry() maintenance.LogEntry {
	return maintenance.LogEntry{EventType: "restring", Notes: pgtype.Text{String: "10s", Valid: true}}
}

// ── GET /gear/{id}/maintenance ────────────────────────────────────────────────

func TestHandler_List_Returns200(t *testing.T) {
	stub := &stubStore{listFn: func(_ context.Context, _ pgtype.UUID) ([]maintenance.LogEntry, error) {
		return []maintenance.LogEntry{fixedEntry()}, nil
	}}
	req := httptest.NewRequest(http.MethodGet, "/gear/cccccccc-0000-0000-0000-000000000001/maintenance", nil)
	req.SetPathValue("id", "cccccccc-0000-0000-0000-000000000001")
	w := httptest.NewRecorder()
	maintenance.NewHandler(stub).ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want 200", w.Code)
	}
	var got []maintenance.LogEntry
	if err := json.NewDecoder(w.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(got) != 1 {
		t.Errorf("expected 1 entry, got %d", len(got))
	}
}

func TestHandler_List_StoreError_Returns500(t *testing.T) {
	stub := &stubStore{listFn: func(_ context.Context, _ pgtype.UUID) ([]maintenance.LogEntry, error) {
		return nil, errors.New("db error")
	}}
	req := httptest.NewRequest(http.MethodGet, "/gear/cccccccc-0000-0000-0000-000000000001/maintenance", nil)
	req.SetPathValue("id", "cccccccc-0000-0000-0000-000000000001")
	w := httptest.NewRecorder()
	maintenance.NewHandler(stub).ServeHTTP(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Errorf("status = %d, want 500", w.Code)
	}
}

// ── POST /gear/{id}/maintenance ───────────────────────────────────────────────

func TestHandler_Create_Returns201(t *testing.T) {
	stub := &stubStore{createFn: func(_ context.Context, _ pgtype.UUID, in maintenance.CreateInput) (maintenance.LogEntry, error) {
		return maintenance.LogEntry{EventType: in.EventType}, nil
	}}
	body, _ := json.Marshal(map[string]any{
		"event_type": "setup",
		"notes":      "Neck relief adjusted",
		"event_date": time.Now().Format("2006-01-02"),
	})
	req := httptest.NewRequest(http.MethodPost, "/gear/cccccccc-0000-0000-0000-000000000001/maintenance", bytes.NewReader(body))
	req.SetPathValue("id", "cccccccc-0000-0000-0000-000000000001")
	w := httptest.NewRecorder()
	maintenance.NewHandler(stub).ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Errorf("status = %d, want 201", w.Code)
	}
}

func TestHandler_Create_MissingEventType_Returns400(t *testing.T) {
	stub := &stubStore{}
	body, _ := json.Marshal(map[string]any{"notes": "no type"})
	req := httptest.NewRequest(http.MethodPost, "/gear/cccccccc-0000-0000-0000-000000000001/maintenance", bytes.NewReader(body))
	req.SetPathValue("id", "cccccccc-0000-0000-0000-000000000001")
	w := httptest.NewRecorder()
	maintenance.NewHandler(stub).ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", w.Code)
	}
}

func TestHandler_Create_MissingEventDate_Returns400(t *testing.T) {
	stub := &stubStore{}
	body, _ := json.Marshal(map[string]any{"event_type": "setup"})
	req := httptest.NewRequest(http.MethodPost, "/gear/cccccccc-0000-0000-0000-000000000001/maintenance", bytes.NewReader(body))
	req.SetPathValue("id", "cccccccc-0000-0000-0000-000000000001")
	w := httptest.NewRecorder()
	maintenance.NewHandler(stub).ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", w.Code)
	}
}

func TestHandler_InvalidUUID_Returns400(t *testing.T) {
	stub := &stubStore{}
	req := httptest.NewRequest(http.MethodGet, "/gear/bad-id/maintenance", nil)
	req.SetPathValue("id", "bad-id")
	w := httptest.NewRecorder()
	maintenance.NewHandler(stub).ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", w.Code)
	}
}
