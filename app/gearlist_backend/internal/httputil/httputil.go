package httputil

import (
	"encoding/json"
	"net/http"
)

// WriteJSON writes status and v encoded as JSON with Content-Type application/json.
func WriteJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v) // #nosec G104 -- ResponseWriter write errors are not actionable
}

// WriteError writes status and {"error": msg} as JSON.
func WriteError(w http.ResponseWriter, status int, msg string) {
	WriteJSON(w, status, map[string]string{"error": msg})
}

// RequireRole returns a handler that checks X-Role matches role before
// delegating to next. Returns 403 if the header is missing or does not match.
func RequireRole(role string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Role") != role {
			WriteError(w, http.StatusForbidden, "forbidden")
			return
		}
		next.ServeHTTP(w, r)
	})
}

// UserFromRequest returns the X-User header value, or "unknown" if absent.
func UserFromRequest(r *http.Request) string {
	if u := r.Header.Get("X-User"); u != "" {
		return u
	}
	return "unknown"
}
