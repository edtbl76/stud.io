package gear_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
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

const gearID = "bbbbbbbb-0000-0000-0000-000000000001"

func fixedGear() gear.GearView {
	var id pgtype.UUID
	id.Scan(gearID) //nolint:errcheck
	return gear.GearView{GearID: id, GearName: "Test Strat"}
}

// uuidFromPath returns the first UUID-shaped segment in url, or "".
func uuidFromPath(url string) string {
	for _, seg := range strings.Split(url, "/") {
		if len(seg) == 36 && strings.Count(seg, "-") == 4 {
			return seg
		}
	}
	return ""
}

// serveGear builds a request and dispatches it to h, returning the recorder.
// It sets X-User and auto-extracts {id} from any UUID segment in url.
func serveGear(h http.Handler, method, url string, body io.Reader) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, url, body)
	if id := uuidFromPath(url); id != "" {
		req.SetPathValue("id", id)
	}
	req.Header.Set("X-User", "admin")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)
	return w
}

func mustStatus(t *testing.T, w *httptest.ResponseRecorder, want int) {
	t.Helper()
	if w.Code != want {
		t.Errorf("status = %d, want %d", w.Code, want)
	}
}

// ── GET /gear ─────────────────────────────────────────────────────────────────

func TestGearHandler_List_TypeIDFilter_PassedToStore(t *testing.T) {
	var gotFilter gear.ListFilter
	stub := &stubGearStore{listFn: func(_ context.Context, f gear.ListFilter) (gear.ListResult, error) {
		gotFilter = f
		return gear.ListResult{}, nil
	}}
	req := httptest.NewRequest(http.MethodGet, "/gear?type_id=aaaaaaaa-0000-0000-0000-000000000001", nil)
	w := httptest.NewRecorder()
	gear.NewHandler(stub).ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}
	if gotFilter.TypeID == nil {
		t.Error("expected TypeID to be set in ListFilter, got nil")
	}
}

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

func TestGearHandler_BadRequest(t *testing.T) {
	tests := []struct {
		name string
		url  string
		id   string
	}{
		{"negative limit", "/gear?limit=-1", ""},
		{"negative offset", "/gear?offset=-5", ""},
		{"invalid UUID", "/gear/not-a-uuid", "not-a-uuid"},
		{"invalid type_id", "/gear?type_id=not-a-uuid", ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, tt.url, nil)
			if tt.id != "" {
				req.SetPathValue("id", tt.id)
			}
			w := httptest.NewRecorder()
			gear.NewHandler(&stubGearStore{}).ServeHTTP(w, req)
			if w.Code != http.StatusBadRequest {
				t.Errorf("status = %d, want 400", w.Code)
			}
		})
	}
}

// ── by-ID routes ─────────────────────────────────────────────────────────────

func TestGearHandler_ByID(t *testing.T) {
	const id = "bbbbbbbb-0000-0000-0000-000000000001"
	patchBody, _ := json.Marshal(map[string]any{"gear_name": "Renamed"})
	tests := []struct {
		name   string
		method string
		path   string
		body   []byte
		stub   *stubGearStore
		want   int
	}{
		{"GET found", http.MethodGet, "/gear/" + id, nil, &stubGearStore{getFn: func(_ context.Context, _ gear.GearID) (gear.GearView, error) {
			return fixedGear(), nil
		}}, http.StatusOK},
		{"GET not found", http.MethodGet, "/gear/ffffffff-ffff-ffff-ffff-ffffffffffff", nil, &stubGearStore{getFn: func(_ context.Context, _ gear.GearID) (gear.GearView, error) {
			return gear.GearView{}, pgx.ErrNoRows
		}}, http.StatusNotFound},
		{"PATCH", http.MethodPatch, "/gear/" + id, patchBody, &stubGearStore{updateFn: func(_ context.Context, _ gear.GearID, _ gear.UpdateInput, _ string) (gear.GearView, error) {
			return fixedGear(), nil
		}}, http.StatusOK},
		{"DELETE", http.MethodDelete, "/gear/" + id, nil, &stubGearStore{deleteFn: func(_ context.Context, _ gear.GearID, _ string) error { return nil }}, http.StatusNoContent},
		{"history", http.MethodGet, "/gear/" + id + "/history", nil, &stubGearStore{historyFn: func(_ context.Context, _ gear.GearID) ([]gear.AuditRow, error) {
			return []gear.AuditRow{{Operation: "CREATE"}}, nil
		}}, http.StatusOK},
		{"photo no uploader", http.MethodPost, "/gear/" + id + "/photo", nil, &stubGearStore{}, http.StatusServiceUnavailable},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(tt.method, tt.path, bytes.NewReader(tt.body))
			req.SetPathValue("id", id)
			req.Header.Set("X-User", "admin")
			w := httptest.NewRecorder()
			gear.NewHandler(tt.stub).ServeHTTP(w, req)
			if w.Code != tt.want {
				t.Errorf("status = %d, want %d", w.Code, tt.want)
			}
		})
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

// ── invalid UUID ─────────────────────────────────────────────────────────────

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

// ── photo upload ──────────────────────────────────────────────────────────────

type stubUploader struct {
	uploadFn func(ctx context.Context, gearID, contentType string, r http.Request) (string, error)
	deleteFn func(ctx context.Context, key string) error
}

func (s *stubUploader) Upload(ctx context.Context, gearID, ct string, r http.Request) (string, error) {
	return s.uploadFn(ctx, gearID, ct, r)
}
func (s *stubUploader) Delete(ctx context.Context, key string) error {
	return s.deleteFn(ctx, key)
}

func TestGearHandler_Photo_UnsupportedMediaType_Returns415(t *testing.T) {
	uploader := &stubUploader{
		uploadFn: func(_ context.Context, _, _ string, _ http.Request) (string, error) {
			return "key", nil
		},
		deleteFn: func(_ context.Context, _ string) error { return nil },
	}
	stub := &stubGearStore{}
	req := httptest.NewRequest(http.MethodPost, "/gear/bbbbbbbb-0000-0000-0000-000000000001/photo", nil)
	req.SetPathValue("id", "bbbbbbbb-0000-0000-0000-000000000001")
	req.Header.Set("Content-Type", "application/pdf")
	w := httptest.NewRecorder()
	gear.NewHandler(stub).WithPhotos(uploader).ServeHTTP(w, req)

	if w.Code != http.StatusUnsupportedMediaType {
		t.Errorf("status = %d, want 415", w.Code)
	}
}

func TestGearHandler_Photo_CleansUpOnSetPhotoKeyFailure(t *testing.T) {
	deleted := false
	uploader := &stubUploader{
		uploadFn: func(_ context.Context, _, _ string, _ http.Request) (string, error) {
			return "gear/id/photo.jpg", nil
		},
		deleteFn: func(_ context.Context, _ string) error {
			deleted = true
			return nil
		},
	}
	stub := &stubGearStore{
		setPhotoFn: func(_ context.Context, _ gear.GearID, _, _ string) error {
			return errors.New("db error")
		},
	}
	const fakeBody = "fake image data"
	req := httptest.NewRequest(http.MethodPost, "/gear/bbbbbbbb-0000-0000-0000-000000000001/photo", strings.NewReader(fakeBody))
	req.SetPathValue("id", "bbbbbbbb-0000-0000-0000-000000000001")
	req.Header.Set("Content-Type", "image/jpeg")
	req.ContentLength = int64(len(fakeBody))
	w := httptest.NewRecorder()
	gear.NewHandler(stub).WithPhotos(uploader).ServeHTTP(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Errorf("status = %d, want 500", w.Code)
	}
	if !deleted {
		t.Error("expected uploaded object to be deleted on SetPhotoKey failure")
	}
}

func TestGearHandler_Create_InvalidJSON_Returns400(t *testing.T) {
	mustStatus(t, serveGear(gear.NewHandler(&stubGearStore{}), http.MethodPost, "/gear", strings.NewReader("{bad json")), http.StatusBadRequest)
}

func TestGearHandler_Create_StoreError_Returns500(t *testing.T) {
	stub := &stubGearStore{createFn: func(_ context.Context, _ gear.CreateInput, _ string) (gear.GearView, error) {
		return gear.GearView{}, errors.New("db error")
	}}
	body, _ := json.Marshal(map[string]any{"gear_name": "Guitar"})
	mustStatus(t, serveGear(gear.NewHandler(stub), http.MethodPost, "/gear", bytes.NewReader(body)), http.StatusInternalServerError)
}

func TestGearHandler_Get_StoreError_Returns500(t *testing.T) {
	stub := &stubGearStore{getFn: func(_ context.Context, _ gear.GearID) (gear.GearView, error) {
		return gear.GearView{}, errors.New("db error")
	}}
	mustStatus(t, serveGear(gear.NewHandler(stub), http.MethodGet, "/gear/"+gearID, nil), http.StatusInternalServerError)
}

func TestGearHandler_Update_InvalidJSON_Returns400(t *testing.T) {
	mustStatus(t, serveGear(gear.NewHandler(&stubGearStore{}), http.MethodPatch, "/gear/"+gearID, strings.NewReader("{bad json")), http.StatusBadRequest)
}

func TestGearHandler_Update_NotFound_Returns404(t *testing.T) {
	stub := &stubGearStore{updateFn: func(_ context.Context, _ gear.GearID, _ gear.UpdateInput, _ string) (gear.GearView, error) {
		return gear.GearView{}, pgx.ErrNoRows
	}}
	body, _ := json.Marshal(map[string]any{"gear_name": "X"})
	mustStatus(t, serveGear(gear.NewHandler(stub), http.MethodPatch, "/gear/"+gearID, bytes.NewReader(body)), http.StatusNotFound)
}

func TestGearHandler_Update_StoreError_Returns500(t *testing.T) {
	stub := &stubGearStore{updateFn: func(_ context.Context, _ gear.GearID, _ gear.UpdateInput, _ string) (gear.GearView, error) {
		return gear.GearView{}, errors.New("db error")
	}}
	body, _ := json.Marshal(map[string]any{"gear_name": "X"})
	mustStatus(t, serveGear(gear.NewHandler(stub), http.MethodPatch, "/gear/"+gearID, bytes.NewReader(body)), http.StatusInternalServerError)
}

func TestGearHandler_Delete_StoreError_Returns500(t *testing.T) {
	stub := &stubGearStore{deleteFn: func(_ context.Context, _ gear.GearID, _ string) error {
		return errors.New("db error")
	}}
	mustStatus(t, serveGear(gear.NewHandler(stub), http.MethodDelete, "/gear/"+gearID, nil), http.StatusInternalServerError)
}

func TestGearHandler_History_StoreError_Returns500(t *testing.T) {
	stub := &stubGearStore{historyFn: func(_ context.Context, _ gear.GearID) ([]gear.AuditRow, error) {
		return nil, errors.New("db error")
	}}
	mustStatus(t, serveGear(gear.NewHandler(stub), http.MethodGet, "/gear/"+gearID+"/history", nil), http.StatusInternalServerError)
}

func TestGearHandler_Photo_UploadError_Returns500(t *testing.T) {
	uploader := &stubUploader{
		uploadFn: func(_ context.Context, _, _ string, _ http.Request) (string, error) {
			return "", errors.New("storage error")
		},
		deleteFn: func(_ context.Context, _ string) error { return nil },
	}
	const fakeBody = "fake image data"
	req := httptest.NewRequest(http.MethodPost, "/gear/"+gearID+"/photo", strings.NewReader(fakeBody))
	req.SetPathValue("id", gearID)
	req.Header.Set("Content-Type", "image/jpeg")
	req.ContentLength = int64(len(fakeBody))
	w := httptest.NewRecorder()
	gear.NewHandler(&stubGearStore{}).WithPhotos(uploader).ServeHTTP(w, req)
	mustStatus(t, w, http.StatusInternalServerError)
}

func TestGearHandler_NotFound_Returns404(t *testing.T) {
	mustStatus(t, serveGear(gear.NewHandler(&stubGearStore{}), http.MethodPut, "/gear", nil), http.StatusNotFound)
}

func TestGearHandler_Photo_UnknownContentLength_Returns413(t *testing.T) {
	uploader := &stubUploader{
		uploadFn: func(_ context.Context, _, _ string, _ http.Request) (string, error) {
			return "key", nil
		},
		deleteFn: func(_ context.Context, _ string) error { return nil },
	}
	for _, cl := range []int64{-1, 0} {
		req := httptest.NewRequest(http.MethodPost, "/gear/bbbbbbbb-0000-0000-0000-000000000001/photo", strings.NewReader("data"))
		req.SetPathValue("id", "bbbbbbbb-0000-0000-0000-000000000001")
		req.Header.Set("Content-Type", "image/jpeg")
		req.ContentLength = cl
		w := httptest.NewRecorder()
		gear.NewHandler(&stubGearStore{}).WithPhotos(uploader).ServeHTTP(w, req)
		if w.Code != http.StatusRequestEntityTooLarge {
			t.Errorf("ContentLength=%d: status = %d, want 413", cl, w.Code)
		}
	}
}
