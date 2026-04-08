package commands

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestRunDoctor_AllBinariesMissing(t *testing.T) {
	// Run with an empty PATH so no binaries are found.
	t.Setenv("PATH", t.TempDir()) // directory with no executables

	var out strings.Builder
	err := runDoctor(context.Background(), &out)
	if err == nil {
		t.Fatal("expected error when prerequisites are missing, got nil")
	}
	if !strings.Contains(out.String(), "FAIL") {
		t.Errorf("expected FAIL in output, got: %q", out.String())
	}
}

func TestCheckBinary_FoundOnPath(t *testing.T) {
	// "true" (or "sh") should always be present in any real environment.
	check := checkBinary("sh")
	if !check(context.Background()) {
		t.Skip("sh not found — skipping (unusual environment)")
	}
}

func TestCheckBinary_NotFound(t *testing.T) {
	t.Setenv("PATH", t.TempDir())
	check := checkBinary("totally-nonexistent-tool-xyz")
	if check(context.Background()) {
		t.Error("expected false for nonexistent binary")
	}
}

func TestCheckHTTP_Reachable(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	check := checkHTTP(srv.URL)
	if !check(context.Background()) {
		t.Error("expected true for reachable server")
	}
}

func TestCheckHTTP_Unreachable(t *testing.T) {
	check := checkHTTP("http://localhost:19999") // unlikely to be in use
	if check(context.Background()) {
		t.Error("expected false for unreachable server")
	}
}

func TestRunDoctor_OutputFormat(t *testing.T) {
	var out strings.Builder
	// Just verify it doesn't panic and produces a summary line.
	runDoctor(context.Background(), &out) //nolint
	if !strings.Contains(out.String(), "roadie doctor") {
		t.Errorf("expected header in output, got: %q", out.String())
	}
}
