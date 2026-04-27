package httputil_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/studiocontrolroom/gearlist_backend/internal/httputil"
)

// ── WriteJSON ─────────────────────────────────────────────────────────────────

func TestWriteJSON_SetsStatusAndContentType(t *testing.T) {
	w := httptest.NewRecorder()
	httputil.WriteJSON(w, http.StatusCreated, map[string]string{"k": "v"})

	if w.Code != http.StatusCreated {
		t.Errorf("status = %d, want %d", w.Code, http.StatusCreated)
	}
	if ct := w.Header().Get("Content-Type"); ct != "application/json" {
		t.Errorf("Content-Type = %q, want application/json", ct)
	}
}

func TestWriteJSON_EncodesBody(t *testing.T) {
	w := httptest.NewRecorder()
	httputil.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})

	var got map[string]string
	if err := json.NewDecoder(w.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got["status"] != "ok" {
		t.Errorf("body status = %q, want ok", got["status"])
	}
}

// ── WriteError ────────────────────────────────────────────────────────────────

func TestWriteError_EncodesErrorField(t *testing.T) {
	w := httptest.NewRecorder()
	httputil.WriteError(w, http.StatusBadRequest, "bad input")

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", w.Code)
	}
	var got map[string]string
	if err := json.NewDecoder(w.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got["error"] != "bad input" {
		t.Errorf("error = %q, want \"bad input\"", got["error"])
	}
}

// ── RequireRole ───────────────────────────────────────────────────────────────

func TestRequireRole(t *testing.T) {
	next := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	handler := httputil.RequireRole("admin", next)

	tests := []struct {
		name string
		role string
		want int
	}{
		{"matching role allowed", "admin", http.StatusOK},
		{"wrong role rejected", "user", http.StatusForbidden},
		{"missing header rejected", "", http.StatusForbidden},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/", nil)
			if tt.role != "" {
				req.Header.Set("X-Role", tt.role)
			}
			w := httptest.NewRecorder()
			handler.ServeHTTP(w, req)
			if w.Code != tt.want {
				t.Errorf("status = %d, want %d", w.Code, tt.want)
			}
		})
	}
}

// ── UserFromRequest ───────────────────────────────────────────────────────────

func TestUserFromRequest_ReturnsHeader(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("X-User", "testuser")
	if got := httputil.UserFromRequest(req); got != "testuser" {
		t.Errorf("got %q, want testuser", got)
	}
}

func TestUserFromRequest_FallsBackToUnknown(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	if got := httputil.UserFromRequest(req); got != "unknown" {
		t.Errorf("got %q, want unknown", got)
	}
}
