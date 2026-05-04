package commands

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
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

func TestCheckTailscaleFunnel_Active(t *testing.T) {
	dir := t.TempDir()
	fakeBin := writeFakeBin(t, dir, "tailscale",
		`#!/bin/sh
echo "https://rogueone.tailbb1c76.ts.net/"
echo "|-- / tcp://localhost:1984"
`)
	_ = fakeBin
	t.Setenv("PATH", dir)

	check := checkTailscaleFunnel(1984)
	if !check(context.Background()) {
		t.Error("expected true when funnel output contains :1984")
	}
}

func TestCheckTailscaleFunnel_Inactive(t *testing.T) {
	dir := t.TempDir()
	writeFakeBin(t, dir, "tailscale", "#!/bin/sh\necho '# No services running.'\n")
	t.Setenv("PATH", dir)

	check := checkTailscaleFunnel(1984)
	if check(context.Background()) {
		t.Error("expected false when funnel output does not contain :1984")
	}
}

func TestCheckTailscaleFunnel_BinaryMissing(t *testing.T) {
	t.Setenv("PATH", t.TempDir())
	check := checkTailscaleFunnel(1984)
	if check(context.Background()) {
		t.Error("expected false when tailscale is not on PATH")
	}
}

// writeFakeBin creates a fake executable named name in dir and returns its path.
func writeFakeBin(t *testing.T, dir, name, script string) string {
	t.Helper()
	path := dir + "/" + name
	if err := os.WriteFile(path, []byte(script), 0755); err != nil { //nolint:gosec
		t.Fatal(err)
	}
	return path
}

func TestRunDoctor_OutputFormat(t *testing.T) {
	var out strings.Builder
	// Just verify it doesn't panic and produces a summary line.
	runDoctor(context.Background(), &out) //nolint
	if !strings.Contains(out.String(), "roadie doctor") {
		t.Errorf("expected header in output, got: %q", out.String())
	}
}
