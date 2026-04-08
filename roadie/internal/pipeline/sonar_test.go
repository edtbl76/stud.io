package pipeline

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// writeLcov creates the lcov.info file at the standard path under root.
func writeLcov(t *testing.T, root, content string) {
	t.Helper()
	dir := filepath.Join(root, "app", "controlroom_frontend", "coverage")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatalf("creating lcov dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dir, "lcov.info"), []byte(content), 0644); err != nil {
		t.Fatalf("writing lcov: %v", err)
	}
}

// sonarGateSrv returns a test server whose CE-component endpoint reports a
// completed task and whose quality-gate endpoint returns gateStatus with the
// given conditions.
func sonarGateSrv(t *testing.T, gateStatus string, conditions []any) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case strings.Contains(r.URL.Path, "/api/ce/component"):
			json.NewEncoder(w).Encode(map[string]any{ //nolint
				"queue":   []any{},
				"current": map[string]any{"status": "SUCCESS"},
			})
		case strings.Contains(r.URL.Path, "/api/qualitygates/project_status"):
			json.NewEncoder(w).Encode(map[string]any{ //nolint
				"projectStatus": map[string]any{
					"status":     gateStatus,
					"conditions": conditions,
				},
			})
		}
	}))
}

func TestFixLcovPaths_AddsPrefixWhenMissing(t *testing.T) {
	tmp := t.TempDir()
	writeLcov(t, tmp, "SF:src/app/layout.tsx\nDA:1,1\n")

	if err := fixLcovPaths(tmp); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	result, _ := os.ReadFile(filepath.Join(tmp, "app", "controlroom_frontend", "coverage", "lcov.info"))
	if !strings.Contains(string(result), "SF:app/controlroom_frontend/src/app/layout.tsx") {
		t.Errorf("expected prefixed SF: line, got:\n%s", result)
	}
}

func TestFixLcovPaths_NoOpWhenAlreadyPrefixed(t *testing.T) {
	tmp := t.TempDir()
	content := "SF:app/controlroom_frontend/src/app/layout.tsx\nDA:1,1\n"
	writeLcov(t, tmp, content)

	if err := fixLcovPaths(tmp); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	result, _ := os.ReadFile(filepath.Join(tmp, "app", "controlroom_frontend", "coverage", "lcov.info"))
	if string(result) != content {
		t.Errorf("expected file unchanged, got:\n%s", result)
	}
}

func TestFixLcovPaths_FixesMixedFile(t *testing.T) {
	// A file where some SF: lines are already prefixed and some are not.
	// The old bytes.Contains short-circuit would skip the whole file.
	tmp := t.TempDir()
	writeLcov(t, tmp, "SF:app/controlroom_frontend/src/a.tsx\nSF:src/b.tsx\nDA:1,1\n")

	if err := fixLcovPaths(tmp); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	result, _ := os.ReadFile(filepath.Join(tmp, "app", "controlroom_frontend", "coverage", "lcov.info"))
	content := string(result)
	if strings.Contains(content, "SF:src/b.tsx") {
		t.Errorf("unprefixed SF: line was not fixed:\n%s", content)
	}
	if !strings.Contains(content, "SF:app/controlroom_frontend/src/b.tsx") {
		t.Errorf("expected prefixed line for b.tsx:\n%s", content)
	}
	if strings.Count(content, "SF:app/controlroom_frontend/src/a.tsx") != 1 {
		t.Errorf("already-prefixed line was duplicated or removed:\n%s", content)
	}
}

func TestFixLcovPaths_ErrorWhenFileNotFound(t *testing.T) {
	err := fixLcovPaths(t.TempDir())
	if err == nil {
		t.Fatal("expected error for missing lcov.info, got nil")
	}
}

func TestLoadSonarToken_FromEnv(t *testing.T) {
	t.Setenv("SONAR_TOKEN", "env-token")
	tok, err := loadSonarToken(t.TempDir())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if tok != "env-token" {
		t.Errorf("expected env-token, got %q", tok)
	}
}

func TestLoadSonarToken_FromFile(t *testing.T) {
	t.Setenv("SONAR_TOKEN", "")
	tmp := t.TempDir()
	os.WriteFile(filepath.Join(tmp, ".sonar-token"), []byte("  file-token\n"), 0644)

	tok, err := loadSonarToken(tmp)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if tok != "file-token" {
		t.Errorf("expected file-token (trimmed), got %q", tok)
	}
}

func TestLoadSonarToken_ErrorWhenMissing(t *testing.T) {
	t.Setenv("SONAR_TOKEN", "")
	_, err := loadSonarToken(t.TempDir())
	if err == nil {
		t.Fatal("expected error when neither env nor file present, got nil")
	}
}

func TestCheckSonarGate_PassesOnOK(t *testing.T) {
	srv := sonarGateSrv(t, "OK", []any{})
	defer srv.Close()

	var out strings.Builder
	if err := checkSonarGate(context.Background(), srv.URL, "token", &out); err != nil {
		t.Errorf("expected nil error for OK gate, got: %v", err)
	}
	if !strings.Contains(out.String(), "OK") {
		t.Errorf("expected OK in output, got: %q", out.String())
	}
}

func TestCheckSonarGate_FailsOnError(t *testing.T) {
	conditions := []any{
		map[string]any{"status": "ERROR", "metricKey": "coverage", "actualValue": "60", "errorThreshold": "80"},
	}
	srv := sonarGateSrv(t, "ERROR", conditions)
	defer srv.Close()

	var out strings.Builder
	err := checkSonarGate(context.Background(), srv.URL, "token", &out)
	if err == nil {
		t.Fatal("expected error for ERROR gate, got nil")
	}
	if !strings.Contains(err.Error(), "ERROR") {
		t.Errorf("expected ERROR in error message, got: %v", err)
	}
}

func TestWaitForCETask_ToleratesTransientErrors(t *testing.T) {
	// First two requests fail, third succeeds — within the threshold.
	calls := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if calls <= 2 {
			http.Error(w, "transient", http.StatusServiceUnavailable)
			return
		}
		json.NewEncoder(w).Encode(map[string]any{ //nolint
			"queue":   []any{},
			"current": map[string]any{"status": "SUCCESS"},
		})
	}))
	defer srv.Close()

	checker := sonarGateChecker{client: srv.Client(), baseURL: srv.URL, token: "tok"}
	var out strings.Builder
	if err := checker.waitForCETask(context.Background(), &out); err != nil {
		t.Errorf("expected nil for recoverable errors, got: %v", err)
	}
}

func TestWaitForCETask_FailsAfterConsecutiveErrors(t *testing.T) {
	// Every request fails — should abort after maxConsecutiveCEErrors+1 calls.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("not-json")) //nolint
	}))
	defer srv.Close()

	checker := sonarGateChecker{client: srv.Client(), baseURL: srv.URL, token: "tok"}
	var out strings.Builder
	err := checker.waitForCETask(context.Background(), &out)
	if err == nil {
		t.Fatal("expected error after consecutive decode failures, got nil")
	}
	if !strings.Contains(err.Error(), "consecutive") {
		t.Errorf("expected 'consecutive' in error, got: %v", err)
	}
}

func TestPytestCoverageStep_Fields(t *testing.T) {
	s := PytestCoverageStep("/repo")
	if s.Name != "pytest-coverage" {
		t.Errorf("Name: got %q, want pytest-coverage", s.Name)
	}
	if s.Bin != "python" {
		t.Errorf("Bin: got %q, want python", s.Bin)
	}
	if s.Dir != "/repo" {
		t.Errorf("Dir: got %q, want /repo (must run from repo root for coverage.xml paths)", s.Dir)
	}
	args := strings.Join(s.Args, " ")
	if !strings.Contains(args, "--cov=app/controlroom_backend") {
		t.Errorf("expected --cov= arg, got: %s", args)
	}
	if !strings.Contains(args, "coverage.xml") {
		t.Errorf("expected coverage.xml arg, got: %s", args)
	}
}
