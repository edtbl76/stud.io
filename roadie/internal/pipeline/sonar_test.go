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
	dir := filepath.Join(root, "app", "studio_frontend", "coverage")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatalf("creating lcov dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dir, "lcov.info"), []byte(content), 0644); err != nil {
		t.Fatalf("writing lcov: %v", err)
	}
}

const testTaskID = "a4855431-aae9-4482-875a-a5a4d2a0ae78"
const testAnalysisID = "AZpx-149740d4"

// sonarGateSrv returns a test server whose CE-task endpoint reports testTaskID as SUCCESS with testAnalysisID, and
// whose quality-gate endpoint answers gateStatus ONLY when asked for that analysis. A query by projectKey (the
// project's latest state, which can still be the previous analysis) gets the opposite status, so a gate that reads the
// wrong thing fails these tests.
func sonarGateSrv(t *testing.T, gateStatus string, conditions []any) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case strings.Contains(r.URL.Path, "/api/ce/task"):
			if r.URL.Query().Get("id") != testTaskID {
				http.Error(w, `{"errors":[{"msg":"No activity found"}]}`, http.StatusNotFound)
				return
			}
			json.NewEncoder(w).Encode(map[string]any{ //nolint
				"task": map[string]any{"id": testTaskID, "status": "SUCCESS", "analysisId": testAnalysisID},
			})
		case strings.Contains(r.URL.Path, "/api/qualitygates/project_status"):
			status := gateStatus
			if r.URL.Query().Get("analysisId") != testAnalysisID {
				status = map[string]string{"OK": "ERROR", "ERROR": "OK"}[gateStatus]
			}
			json.NewEncoder(w).Encode(map[string]any{ //nolint
				"projectStatus": map[string]any{
					"status":     status,
					"conditions": conditions,
				},
			})
		}
	}))
}

// ceTaskSrv serves /api/ce/task from a list of (status, analysisId) answers, one per call; the last repeats.
func ceTaskSrv(t *testing.T, answers [][2]string) *httptest.Server {
	t.Helper()
	calls := 0
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		a := answers[min(calls, len(answers)-1)]
		calls++
		json.NewEncoder(w).Encode(map[string]any{ //nolint
			"task": map[string]any{"id": r.URL.Query().Get("id"), "status": a[0], "analysisId": a[1]},
		})
	}))
}

// The real scanner line, copied from stud.io CI #21's log (2026-11-10).
const realScannerTail = `[sonar-scanner] 21:33:50.171 INFO  ANALYSIS SUCCESSFUL, you can find the results at: http://192.168.1.243:30969/dashboard?id=controlroom
[sonar-scanner] 21:33:50.171 INFO  Note that you will be able to access the updated dashboard once the server has processed the submitted analysis report
[sonar-scanner] 21:33:50.172 INFO  More about the report processing at http://192.168.1.243:30969/api/ce/task?id=a4855431-aae9-4482-875a-a5a4d2a0ae78
[sonar-scanner] 21:33:50.412 INFO  Analysis total time: 23.094 s
`

func TestCETaskIDFromScannerOutput_RealLine(t *testing.T) {
	id, err := ceTaskIDFromScannerOutput(realScannerTail)
	if err != nil || id != testTaskID {
		t.Fatalf("want %q, got %q (err %v)", testTaskID, id, err)
	}
}

func TestCETaskIDFromScannerOutput_MissingFailsClosed(t *testing.T) {
	_, err := ceTaskIDFromScannerOutput("[sonar-scanner] INFO  EXECUTION SUCCESS\n")
	if err == nil || !strings.Contains(err.Error(), "CE task id") {
		t.Fatalf("no task id in the output must be an error naming it, got %v", err)
	}
}

// The 2026-11-10 bug: the gate read the project's latest status, which was still the PREVIOUS analysis, so #19
// passed with 4 new issues and #21 failed clean code. The server here answers the opposite status for that query.
func TestCheckSonarGate_ReadsThisAnalysisNotTheProjectsLatest(t *testing.T) {
	srv := sonarGateSrv(t, "OK", []any{})
	defer srv.Close()
	var out strings.Builder
	if err := checkSonarGate(context.Background(), srv.URL, "token", testTaskID, &out); err != nil {
		t.Fatalf("this analysis is OK; a gate reading the project's latest (ERROR) is the bug: %v", err)
	}
}

func TestWaitForCETask_WaitsThroughPendingAndInProgress(t *testing.T) {
	srv := ceTaskSrv(t, [][2]string{{"PENDING", ""}, {"IN_PROGRESS", ""}, {"SUCCESS", testAnalysisID}})
	defer srv.Close()
	checker := sonarGateChecker{client: srv.Client(), baseURL: srv.URL, token: "tok", pollEvery: 1}
	var out strings.Builder
	got, err := checker.waitForCETask(context.Background(), testTaskID, &out)
	if err != nil || got != testAnalysisID {
		t.Fatalf("want analysis %q, got %q (err %v)", testAnalysisID, got, err)
	}
}

func TestWaitForCETask_FailedTaskFailsClosed(t *testing.T) {
	for _, st := range []string{"FAILED", "CANCELED"} {
		srv := ceTaskSrv(t, [][2]string{{st, ""}})
		checker := sonarGateChecker{client: srv.Client(), baseURL: srv.URL, token: "tok", pollEvery: 1}
		var out strings.Builder
		_, err := checker.waitForCETask(context.Background(), testTaskID, &out)
		srv.Close()
		if err == nil || !strings.Contains(err.Error(), st) {
			t.Errorf("task %s must fail the gate naming the status, got %v", st, err)
		}
	}
}

func TestWaitForCETask_SuccessWithoutAnalysisIDFailsClosed(t *testing.T) {
	srv := ceTaskSrv(t, [][2]string{{"SUCCESS", ""}})
	defer srv.Close()
	checker := sonarGateChecker{client: srv.Client(), baseURL: srv.URL, token: "tok", pollEvery: 1}
	var out strings.Builder
	_, err := checker.waitForCETask(context.Background(), testTaskID, &out)
	if err == nil || !strings.Contains(err.Error(), "analysisId") {
		t.Fatalf("SUCCESS with no analysisId must be an error, got %v", err)
	}
}

func TestFetchGateStatus_EmptyStatusFailsClosed(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"projectStatus":{}}`)) //nolint
	}))
	defer srv.Close()
	var out strings.Builder
	err := checkSonarGate(context.Background(), srv.URL, "token", testTaskID, &out)
	if err == nil {
		t.Fatal("an empty gate status must not pass")
	}
}

func TestFixLcovPaths_AddsPrefixWhenMissing(t *testing.T) {
	tmp := t.TempDir()
	writeLcov(t, tmp, "SF:src/app/layout.tsx\nDA:1,1\n")

	if err := fixLcovPaths(tmp); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	result, _ := os.ReadFile(filepath.Join(tmp, "app", "studio_frontend", "coverage", "lcov.info"))
	if !strings.Contains(string(result), "SF:app/studio_frontend/src/app/layout.tsx") {
		t.Errorf("expected prefixed SF: line, got:\n%s", result)
	}
}

func TestFixLcovPaths_NoOpWhenAlreadyPrefixed(t *testing.T) {
	tmp := t.TempDir()
	content := "SF:app/studio_frontend/src/app/layout.tsx\nDA:1,1\n"
	writeLcov(t, tmp, content)

	if err := fixLcovPaths(tmp); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	result, _ := os.ReadFile(filepath.Join(tmp, "app", "studio_frontend", "coverage", "lcov.info"))
	if string(result) != content {
		t.Errorf("expected file unchanged, got:\n%s", result)
	}
}

func TestFixLcovPaths_FixesMixedFile(t *testing.T) {
	// A file where some SF: lines are already prefixed and some are not.
	// The old bytes.Contains short-circuit would skip the whole file.
	tmp := t.TempDir()
	writeLcov(t, tmp, "SF:app/studio_frontend/src/a.tsx\nSF:src/b.tsx\nDA:1,1\n")

	if err := fixLcovPaths(tmp); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	result, _ := os.ReadFile(filepath.Join(tmp, "app", "studio_frontend", "coverage", "lcov.info"))
	content := string(result)
	if strings.Contains(content, "SF:src/b.tsx") {
		t.Errorf("unprefixed SF: line was not fixed:\n%s", content)
	}
	if !strings.Contains(content, "SF:app/studio_frontend/src/b.tsx") {
		t.Errorf("expected prefixed line for b.tsx:\n%s", content)
	}
	if strings.Count(content, "SF:app/studio_frontend/src/a.tsx") != 1 {
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
	if err := checkSonarGate(context.Background(), srv.URL, "token", testTaskID, &out); err != nil {
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
	err := checkSonarGate(context.Background(), srv.URL, "token", testTaskID, &out)
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
			"task": map[string]any{"id": testTaskID, "status": "SUCCESS", "analysisId": testAnalysisID},
		})
	}))
	defer srv.Close()

	checker := sonarGateChecker{client: srv.Client(), baseURL: srv.URL, token: "tok", pollEvery: 1}
	var out strings.Builder
	if _, err := checker.waitForCETask(context.Background(), testTaskID, &out); err != nil {
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

	checker := sonarGateChecker{client: srv.Client(), baseURL: srv.URL, token: "tok", pollEvery: 1}
	var out strings.Builder
	_, err := checker.waitForCETask(context.Background(), testTaskID, &out)
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
	// Containerized into the backend test image (like PytestStep) so the host
	// pyenv segfault under coverage + rapidfuzz AVX2 is avoided. docker run with
	// workdir = repo root (so the relative --cov source path resolves for the
	// scanner) and the DB netns shared for conftest.
	if s.Bin != "docker" {
		t.Errorf("Bin: got %q, want docker (containerized)", s.Bin)
	}
	args := strings.Join(s.Args, " ")
	if !strings.Contains(args, "-w /repo") {
		t.Errorf("Args missing workdir -w /repo: %v", s.Args)
	}
	if !strings.Contains(args, "--network container:studio_db") {
		t.Errorf("Args missing DB netns share: %v", s.Args)
	}
	if !strings.Contains(args, backendTestImage) {
		t.Errorf("Args missing backend test image %q: %v", backendTestImage, s.Args)
	}
	if !strings.Contains(args, "--cov=app/controlroom_backend") {
		t.Errorf("expected --cov= arg, got: %s", args)
	}
	if !strings.Contains(args, "coverage.xml") {
		t.Errorf("expected coverage.xml arg, got: %s", args)
	}
}
