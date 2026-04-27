package gear_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/studiocontrolroom/gearlist_backend/internal/gear"
)

// ── stub store ────────────────────────────────────────────────────────────────

type stubGearStore struct {
	listFn     func(context.Context, gear.ListFilter) (gear.ListResult, error)
	getFn      func(context.Context, gear.GearID) (gear.GearView, error)
	createFn   func(context.Context, gear.CreateInput, string) (gear.GearView, error)
	updateFn   func(context.Context, gear.GearID, gear.UpdateInput, string) (gear.GearView, error)
	deleteFn   func(context.Context, gear.GearID, string) error
	setPhotoFn func(context.Context, gear.GearID, string, string) error
	historyFn  func(context.Context, gear.GearID) ([]gear.AuditRow, error)
}

func (s *stubGearStore) List(ctx context.Context, f gear.ListFilter) (gear.ListResult, error) {
	return s.listFn(ctx, f)
}
func (s *stubGearStore) Get(ctx context.Context, id gear.GearID) (gear.GearView, error) {
	return s.getFn(ctx, id)
}
func (s *stubGearStore) Create(ctx context.Context, in gear.CreateInput, by string) (gear.GearView, error) {
	return s.createFn(ctx, in, by)
}
func (s *stubGearStore) Update(ctx context.Context, id gear.GearID, in gear.UpdateInput, by string) (gear.GearView, error) {
	return s.updateFn(ctx, id, in, by)
}
func (s *stubGearStore) SoftDelete(ctx context.Context, id gear.GearID, by string) error {
	return s.deleteFn(ctx, id, by)
}
func (s *stubGearStore) SetPhotoKey(ctx context.Context, id gear.GearID, key, by string) error {
	return s.setPhotoFn(ctx, id, key, by)
}
func (s *stubGearStore) History(ctx context.Context, id gear.GearID) ([]gear.AuditRow, error) {
	return s.historyFn(ctx, id)
}

func fixedGear() gear.GearView {
	var id pgtype.UUID
	id.Scan("bbbbbbbb-0000-0000-0000-000000000001") //nolint:errcheck
	return gear.GearView{GearID: id, GearName: "Test Strat"}
}

// ── GET /gear ─────────────────────────────────────────────────────────────────

func TestGearHandler_List_Returns200(t *testing.T) {
	stub := &stubGearStore{listFn: func(_ context.Context, _ gear.ListFilter) (gear.ListResult, error) {
		return gear.ListResult{Items: []gear.GearView{fixedGear()}, Total: 1}, nil
	}}
	req := httptest.NewRequest(http.MethodGet, "/gear", nil)
	w := httptest.NewRecorder()
	gear.NewHandler(stub).ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want 200", w.Code)
	}
	var got gear.ListResult
	if err := json.NewDecoder(w.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.Total != 1 || len(got.Items) != 1 {
		t.Errorf("unexpected result: %+v", got)
	}
}

// ── GET /gear/{id} ────────────────────────────────────────────────────────────

func TestGearHandler_Get_Returns200(t *testing.T) {
	stub := &stubGearStore{getFn: func(_ context.Context, _ gear.GearID) (gear.GearView, error) {
		return fixedGear(), nil
	}}
	req := httptest.NewRequest(http.MethodGet, "/gear/bbbbbbbb-0000-0000-0000-000000000001", nil)
	req.SetPathValue("id", "bbbbbbbb-0000-0000-0000-000000000001")
	w := httptest.NewRecorder()
	gear.NewHandler(stub).ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want 200", w.Code)
	}
}

func TestGearHandler_Get_NotFound_Returns404(t *testing.T) {
	stub := &stubGearStore{getFn: func(_ context.Context, _ gear.GearID) (gear.GearView, error) {
		return gear.GearView{}, pgx.ErrNoRows
	}}
	req := httptest.NewRequest(http.MethodGet, "/gear/ffffffff-ffff-ffff-ffff-ffffffffffff", nil)
	req.SetPathValue("id", "ffffffff-ffff-ffff-ffff-ffffffffffff")
	w := httptest.NewRecorder()
	gear.NewHandler(stub).ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("status = %d, want 404", w.Code)
	}
}

// ── POST /gear ────────────────────────────────────────────────────────────────

func TestGearHandler_Create_Returns201(t *testing.T) {
	stub := &stubGearStore{createFn: func(_ context.Context, in gear.CreateInput, _ string) (gear.GearView, error) {
		g := fixedGear()
		g.GearName = in.GearName
		return g, nil
	}}
	var typeID pgtype.UUID
	typeID.Scan("aaaaaaaa-0000-0000-0000-000000000001") //nolint:errcheck
	body, _ := json.Marshal(map[string]any{"gear_name": "My Guitar", "gear_type_id": typeID})
	req := httptest.NewRequest(http.MethodPost, "/gear", bytes.NewReader(body))
	req.Header.Set("X-User", "admin")
	w := httptest.NewRecorder()
	gear.NewHandler(stub).ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Errorf("status = %d, want 201", w.Code)
	}
}

func TestGearHandler_Create_MissingName_Returns400(t *testing.T) {
	stub := &stubGearStore{}
	body, _ := json.Marshal(map[string]any{})
	req := httptest.NewRequest(http.MethodPost, "/gear", bytes.NewReader(body))
	req.Header.Set("X-User", "admin")
	w := httptest.NewRecorder()
	gear.NewHandler(stub).ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", w.Code)
	}
}

// ── PATCH /gear/{id} ──────────────────────────────────────────────────────────

func TestGearHandler_Update_Returns200(t *testing.T) {
	stub := &stubGearStore{updateFn: func(_ context.Context, _ gear.GearID, _ gear.UpdateInput, _ string) (gear.GearView, error) {
		return fixedGear(), nil
	}}
	body, _ := json.Marshal(map[string]any{"gear_name": "Renamed"})
	req := httptest.NewRequest(http.MethodPatch, "/gear/bbbbbbbb-0000-0000-0000-000000000001", bytes.NewReader(body))
	req.SetPathValue("id", "bbbbbbbb-0000-0000-0000-000000000001")
	req.Header.Set("X-User", "admin")
	w := httptest.NewRecorder()
	gear.NewHandler(stub).ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want 200", w.Code)
	}
}

// ── DELETE /gear/{id} ─────────────────────────────────────────────────────────

func TestGearHandler_Delete_Returns204(t *testing.T) {
	stub := &stubGearStore{deleteFn: func(_ context.Context, _ gear.GearID, _ string) error {
		return nil
	}}
	req := httptest.NewRequest(http.MethodDelete, "/gear/bbbbbbbb-0000-0000-0000-000000000001", nil)
	req.SetPathValue("id", "bbbbbbbb-0000-0000-0000-000000000001")
	req.Header.Set("X-User", "admin")
	w := httptest.NewRecorder()
	gear.NewHandler(stub).ServeHTTP(w, req)

	if w.Code != http.StatusNoContent {
		t.Errorf("status = %d, want 204", w.Code)
	}
}

// ── GET /gear/{id}/history ────────────────────────────────────────────────────

func TestGearHandler_History_Returns200(t *testing.T) {
	stub := &stubGearStore{historyFn: func(_ context.Context, _ gear.GearID) ([]gear.AuditRow, error) {
		return []gear.AuditRow{{Operation: "CREATE", PerformedBy: "admin"}}, nil
	}}
	req := httptest.NewRequest(http.MethodGet, "/gear/bbbbbbbb-0000-0000-0000-000000000001/history", nil)
	req.SetPathValue("id", "bbbbbbbb-0000-0000-0000-000000000001")
	w := httptest.NewRecorder()
	gear.NewHandler(stub).ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want 200", w.Code)
	}
}

// ── POST /gear/{id}/photo ─────────────────────────────────────────────────────

func TestGearHandler_Photo_NoUploader_Returns503(t *testing.T) {
	stub := &stubGearStore{}
	req := httptest.NewRequest(http.MethodPost, "/gear/bbbbbbbb-0000-0000-0000-000000000001/photo", nil)
	req.SetPathValue("id", "bbbbbbbb-0000-0000-0000-000000000001")
	req.Header.Set("X-User", "admin")
	w := httptest.NewRecorder()
	// NewHandler with nil uploader → 503
	gear.NewHandler(stub).ServeHTTP(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("status = %d, want 503", w.Code)
	}
}

// ── invalid UUID ─────────────────────────────────────────────────────────────

func TestGearHandler_InvalidUUID_Returns400(t *testing.T) {
	stub := &stubGearStore{}
	req := httptest.NewRequest(http.MethodGet, "/gear/not-a-uuid", nil)
	req.SetPathValue("id", "not-a-uuid")
	w := httptest.NewRecorder()
	gear.NewHandler(stub).ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", w.Code)
	}
}

// ── store error → 500 ─────────────────────────────────────────────────────────

func TestGearHandler_List_StoreError_Returns500(t *testing.T) {
	stub := &stubGearStore{listFn: func(_ context.Context, _ gear.ListFilter) (gear.ListResult, error) {
		return gear.ListResult{}, errors.New("db down")
	}}
	req := httptest.NewRequest(http.MethodGet, "/gear", nil)
	w := httptest.NewRecorder()
	gear.NewHandler(stub).ServeHTTP(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Errorf("status = %d, want 500", w.Code)
	}
}
