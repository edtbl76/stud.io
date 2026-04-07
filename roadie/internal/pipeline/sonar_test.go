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

func TestFixLcovPaths_AddsPrefixWhenMissing(t *testing.T) {
	tmp := t.TempDir()
	lcovDir := filepath.Join(tmp, "app", "controlroom_frontend", "coverage")
	os.MkdirAll(lcovDir, 0o755)
	lcovPath := filepath.Join(lcovDir, "lcov.info")

	original := "SF:src/app/layout.tsx\nDA:1,1\n"
	os.WriteFile(lcovPath, []byte(original), 0644)

	if err := fixLcovPaths(tmp); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	result, _ := os.ReadFile(lcovPath)
	if !strings.Contains(string(result), "SF:app/controlroom_frontend/src/app/layout.tsx") {
		t.Errorf("expected prefixed SF: line, got:\n%s", result)
	}
}

func TestFixLcovPaths_NoOpWhenAlreadyPrefixed(t *testing.T) {
	tmp := t.TempDir()
	lcovDir := filepath.Join(tmp, "app", "controlroom_frontend", "coverage")
	os.MkdirAll(lcovDir, 0o755)
	lcovPath := filepath.Join(lcovDir, "lcov.info")

	content := "SF:app/controlroom_frontend/src/app/layout.tsx\nDA:1,1\n"
	os.WriteFile(lcovPath, []byte(content), 0644)

	if err := fixLcovPaths(tmp); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	result, _ := os.ReadFile(lcovPath)
	if string(result) != content {
		t.Errorf("expected file unchanged, got:\n%s", result)
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
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case strings.Contains(r.URL.Path, "/api/ce/component"):
			json.NewEncoder(w).Encode(map[string]any{"queue": []any{}, "current": map[string]any{"status": "SUCCESS"}})
		case strings.Contains(r.URL.Path, "/api/qualitygates/project_status"):
			json.NewEncoder(w).Encode(map[string]any{
				"projectStatus": map[string]any{"status": "OK", "conditions": []any{}},
			})
		}
	}))
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
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case strings.Contains(r.URL.Path, "/api/ce/component"):
			json.NewEncoder(w).Encode(map[string]any{"queue": []any{}, "current": map[string]any{"status": "SUCCESS"}})
		case strings.Contains(r.URL.Path, "/api/qualitygates/project_status"):
			json.NewEncoder(w).Encode(map[string]any{
				"projectStatus": map[string]any{
					"status": "ERROR",
					"conditions": []any{
						map[string]any{"status": "ERROR", "metricKey": "coverage", "actualValue": "60", "errorThreshold": "80"},
					},
				},
			})
		}
	}))
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
