package geartypes_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/studiocontrolroom/gearlist_backend/internal/geartypes"
)

// ── stub store ────────────────────────────────────────────────────────────────

type stubStore struct {
	listFn   func(ctx context.Context) ([]geartypes.GearType, error)
	getFn    func(ctx context.Context, id geartypes.TypeID) (geartypes.GearType, error)
	createFn func(ctx context.Context, in geartypes.CreateInput, by string) (geartypes.GearType, error)
	updateFn func(ctx context.Context, id geartypes.TypeID, in geartypes.UpdateInput, by string) (geartypes.GearType, error)
	deleteFn func(ctx context.Context, id geartypes.TypeID, by string) error
}

func (s *stubStore) List(ctx context.Context) ([]geartypes.GearType, error) {
	return s.listFn(ctx)
}
func (s *stubStore) Get(ctx context.Context, id geartypes.TypeID) (geartypes.GearType, error) {
	return s.getFn(ctx, id)
}
func (s *stubStore) Create(ctx context.Context, in geartypes.CreateInput, by string) (geartypes.GearType, error) {
	return s.createFn(ctx, in, by)
}
func (s *stubStore) Update(ctx context.Context, id geartypes.TypeID, in geartypes.UpdateInput, by string) (geartypes.GearType, error) {
	return s.updateFn(ctx, id, in, by)
}
func (s *stubStore) SoftDelete(ctx context.Context, id geartypes.TypeID, by string) error {
	return s.deleteFn(ctx, id, by)
}

func fixedType() geartypes.GearType {
	var id pgtype.UUID
	id.Scan("aaaaaaaa-0000-0000-0000-000000000001") //nolint:errcheck
	return geartypes.GearType{TypeID: id, TypeName: "Guitar"}
}

const typeID = "aaaaaaaa-0000-0000-0000-000000000001"

func newHandler(stub *stubStore) *geartypes.Handler {
	return geartypes.NewHandler(stub)
}

// serveGT builds a request and dispatches it to h, returning the recorder.
func serveGT(t *testing.T, h *geartypes.Handler, method, url, pathID string, body io.Reader) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, url, body)
	if pathID != "" {
		req.SetPathValue("id", pathID)
	}
	req.Header.Set("X-User", "admin")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)
	return w
}

func mustCode(t *testing.T, w *httptest.ResponseRecorder, want int) {
	t.Helper()
	if w.Code != want {
		t.Errorf("status = %d, want %d", w.Code, want)
	}
}

// ── GET /gear-types ───────────────────────────────────────────────────────────

func TestHandler_List_Returns200(t *testing.T) {
	stub := &stubStore{listFn: func(_ context.Context) ([]geartypes.GearType, error) {
		return []geartypes.GearType{fixedType()}, nil
	}}
	req := httptest.NewRequest(http.MethodGet, "/gear-types", nil)
	w := httptest.NewRecorder()
	newHandler(stub).ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want 200", w.Code)
	}
	var got []geartypes.GearType
	if err := json.NewDecoder(w.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(got) != 1 || got[0].TypeName != "Guitar" {
		t.Errorf("unexpected body: %v", got)
	}
}

func TestHandler_List_StoreError_Returns500(t *testing.T) {
	stub := &stubStore{listFn: func(_ context.Context) ([]geartypes.GearType, error) {
		return nil, errors.New("db down")
	}}
	req := httptest.NewRequest(http.MethodGet, "/gear-types", nil)
	w := httptest.NewRecorder()
	newHandler(stub).ServeHTTP(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Errorf("status = %d, want 500", w.Code)
	}
}

// ── GET /gear-types/{id} ──────────────────────────────────────────────────────

func TestHandler_GetByID(t *testing.T) {
	const validID = "aaaaaaaa-0000-0000-0000-000000000001"
	tests := []struct {
		name string
		stub *stubStore
		id   string
		want int
	}{
		{"found", &stubStore{getFn: func(_ context.Context, _ geartypes.TypeID) (geartypes.GearType, error) {
			return fixedType(), nil
		}}, validID, http.StatusOK},
		{"not found", &stubStore{getFn: func(_ context.Context, _ geartypes.TypeID) (geartypes.GearType, error) {
			return geartypes.GearType{}, pgx.ErrNoRows
		}}, "ffffffff-ffff-ffff-ffff-ffffffffffff", http.StatusNotFound},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/gear-types/"+tt.id, nil)
			req.SetPathValue("id", tt.id)
			w := httptest.NewRecorder()
			newHandler(tt.stub).ServeHTTP(w, req)
			if w.Code != tt.want {
				t.Errorf("status = %d, want %d", w.Code, tt.want)
			}
		})
	}
}

// ── POST /gear-types ──────────────────────────────────────────────────────────

func TestHandler_Create_Returns201(t *testing.T) {
	stub := &stubStore{createFn: func(_ context.Context, in geartypes.CreateInput, _ string) (geartypes.GearType, error) {
		gt := fixedType()
		gt.TypeName = in.Name
		return gt, nil
	}}
	body, _ := json.Marshal(map[string]string{"type_name": "Amp"})
	req := httptest.NewRequest(http.MethodPost, "/gear-types", bytes.NewReader(body))
	req.Header.Set("X-User", "admin")
	w := httptest.NewRecorder()
	newHandler(stub).ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Errorf("status = %d, want 201", w.Code)
	}
}

func TestHandler_Create_MissingName_Returns400(t *testing.T) {
	stub := &stubStore{}
	body, _ := json.Marshal(map[string]string{})
	req := httptest.NewRequest(http.MethodPost, "/gear-types", bytes.NewReader(body))
	req.Header.Set("X-User", "admin")
	w := httptest.NewRecorder()
	newHandler(stub).ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", w.Code)
	}
}

// ── PATCH /gear-types/{id} ────────────────────────────────────────────────────

func TestHandler_Update_Returns200(t *testing.T) {
	stub := &stubStore{
		getFn: func(_ context.Context, _ geartypes.TypeID) (geartypes.GearType, error) {
			return fixedType(), nil
		},
		updateFn: func(_ context.Context, _ geartypes.TypeID, in geartypes.UpdateInput, _ string) (geartypes.GearType, error) {
			gt := fixedType()
			if in.Name != nil {
				gt.TypeName = *in.Name
			}
			return gt, nil
		},
	}
	body, _ := json.Marshal(map[string]string{"type_name": "Pedal"})
	req := httptest.NewRequest(http.MethodPatch, "/gear-types/aaaaaaaa-0000-0000-0000-000000000001", bytes.NewReader(body))
	req.SetPathValue("id", "aaaaaaaa-0000-0000-0000-000000000001")
	req.Header.Set("X-User", "admin")
	w := httptest.NewRecorder()
	newHandler(stub).ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want 200", w.Code)
	}
}

// ── DELETE /gear-types/{id} ───────────────────────────────────────────────────

func TestHandler_Delete_Returns204(t *testing.T) {
	stub := &stubStore{deleteFn: func(_ context.Context, _ geartypes.TypeID, _ string) error { return nil }}
	req := httptest.NewRequest(http.MethodDelete, "/gear-types/aaaaaaaa-0000-0000-0000-000000000001", nil)
	req.SetPathValue("id", "aaaaaaaa-0000-0000-0000-000000000001")
	req.Header.Set("X-User", "admin")
	w := httptest.NewRecorder()
	newHandler(stub).ServeHTTP(w, req)
	if w.Code != http.StatusNoContent {
		t.Errorf("status = %d, want 204", w.Code)
	}
}

func TestHandler_Delete_InvalidUUID_Returns400(t *testing.T) {
	stub := &stubStore{}
	req := httptest.NewRequest(http.MethodDelete, "/gear-types/not-a-uuid", nil)
	req.SetPathValue("id", "not-a-uuid")
	req.Header.Set("X-User", "admin")
	w := httptest.NewRecorder()
	newHandler(stub).ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", w.Code)
	}
}

func TestHandler_Get_StoreError_Returns500(t *testing.T) {
	stub := &stubStore{getFn: func(_ context.Context, _ geartypes.TypeID) (geartypes.GearType, error) {
		return geartypes.GearType{}, errors.New("db error")
	}}
	mustCode(t, serveGT(t, newHandler(stub), http.MethodGet, "/gear-types/"+typeID, typeID, nil), http.StatusInternalServerError)
}

func TestHandler_Get_InvalidUUID_Returns400(t *testing.T) {
	mustCode(t, serveGT(t, newHandler(&stubStore{}), http.MethodGet, "/gear-types/not-a-uuid", "not-a-uuid", nil), http.StatusBadRequest)
}

func TestHandler_Create_InvalidJSON_Returns400(t *testing.T) {
	mustCode(t, serveGT(t, newHandler(&stubStore{}), http.MethodPost, "/gear-types", "", bytes.NewReader([]byte("{bad json"))), http.StatusBadRequest)
}

func TestHandler_Create_StoreError_Returns500(t *testing.T) {
	stub := &stubStore{createFn: func(_ context.Context, _ geartypes.CreateInput, _ string) (geartypes.GearType, error) {
		return geartypes.GearType{}, errors.New("db error")
	}}
	body, _ := json.Marshal(map[string]string{"type_name": "Amp"})
	mustCode(t, serveGT(t, newHandler(stub), http.MethodPost, "/gear-types", "", bytes.NewReader(body)), http.StatusInternalServerError)
}

func TestHandler_Update_InvalidUUID_Returns400(t *testing.T) {
	body, _ := json.Marshal(map[string]string{"type_name": "X"})
	mustCode(t, serveGT(t, newHandler(&stubStore{}), http.MethodPatch, "/gear-types/not-a-uuid", "not-a-uuid", bytes.NewReader(body)), http.StatusBadRequest)
}

func TestHandler_Update_InvalidJSON_Returns400(t *testing.T) {
	mustCode(t, serveGT(t, newHandler(&stubStore{}), http.MethodPatch, "/gear-types/"+typeID, typeID, bytes.NewReader([]byte("{bad json"))), http.StatusBadRequest)
}

func TestHandler_Update_NotFound_Returns404(t *testing.T) {
	stub := &stubStore{updateFn: func(_ context.Context, _ geartypes.TypeID, _ geartypes.UpdateInput, _ string) (geartypes.GearType, error) {
		return geartypes.GearType{}, pgx.ErrNoRows
	}}
	body, _ := json.Marshal(map[string]string{"type_name": "X"})
	mustCode(t, serveGT(t, newHandler(stub), http.MethodPatch, "/gear-types/"+typeID, typeID, bytes.NewReader(body)), http.StatusNotFound)
}

func TestHandler_Update_StoreError_Returns500(t *testing.T) {
	stub := &stubStore{updateFn: func(_ context.Context, _ geartypes.TypeID, _ geartypes.UpdateInput, _ string) (geartypes.GearType, error) {
		return geartypes.GearType{}, errors.New("db error")
	}}
	body, _ := json.Marshal(map[string]string{"type_name": "X"})
	mustCode(t, serveGT(t, newHandler(stub), http.MethodPatch, "/gear-types/"+typeID, typeID, bytes.NewReader(body)), http.StatusInternalServerError)
}

func TestHandler_Delete_StoreError_Returns500(t *testing.T) {
	stub := &stubStore{deleteFn: func(_ context.Context, _ geartypes.TypeID, _ string) error {
		return errors.New("db error")
	}}
	mustCode(t, serveGT(t, newHandler(stub), http.MethodDelete, "/gear-types/"+typeID, typeID, nil), http.StatusInternalServerError)
}

func TestHandler_UnknownMethod_Returns404(t *testing.T) {
	mustCode(t, serveGT(t, newHandler(&stubStore{}), http.MethodPut, "/gear-types", "", nil), http.StatusNotFound)
}
