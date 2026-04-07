package commands

import (
	"strings"
	"testing"

	"github.com/studiocontrolroom/roadie/internal/pipeline"
)

// ── helpers ───────────────────────────────────────────────────────────────────

func stepNames(steps []pipeline.ToolStep) []string {
	names := make([]string, len(steps))
	for i, s := range steps {
		names[i] = s.Name
	}
	return names
}

// assertSteps verifies that got matches want element-by-element.
func assertSteps(t *testing.T, got, want []string) {
	t.Helper()
	if len(got) != len(want) {
		t.Fatalf("step count: got %d (%v), want %d (%v)", len(got), got, len(want), want)
	}
	for i, n := range want {
		if got[i] != n {
			t.Errorf("step[%d]: got %q, want %q", i, got[i], n)
		}
	}
}

// ── buildUnitPipeline ─────────────────────────────────────────────────────────

func TestBuildUnitPipeline(t *testing.T) {
	tests := []struct {
		name  string
		tools []string
		want  []string
	}{
		{"all tools", nil, []string{"npm-install", "tsc", "jest", "ruff", "bandit", "pytest"}},
		{"tsc only", []string{"tsc"}, []string{"npm-install", "tsc"}},
		{"pytest only", []string{"pytest"}, []string{"pytest"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assertSteps(t, stepNames(buildUnitPipeline("/repo", tt.tools)), tt.want)
		})
	}
}

func TestBuildUnitPipeline_PytestHasBenchmarkSkip(t *testing.T) {
	steps := buildUnitPipeline("/repo", []string{"pytest"})
	if len(steps) == 0 {
		t.Fatal("expected at least one step")
	}
	args := strings.Join(steps[0].Args, " ")
	if !strings.Contains(args, "--benchmark-skip") {
		t.Errorf("pytest step args %q missing --benchmark-skip", args)
	}
}

// ── buildScanFlags ────────────────────────────────────────────────────────────

func TestBuildScanFlags(t *testing.T) {
	tests := []struct {
		name string
		args []string
		gate bool
		want pipeline.ScanFlags
	}{
		{"all by default", nil, false, pipeline.ScanFlags{Sonar: true, Trivy: true, Secrets: true, Headers: true}},
		{"trivy only", []string{"trivy"}, false, pipeline.ScanFlags{Trivy: true}},
		{"sonar with gate", []string{"sonar"}, true, pipeline.ScanFlags{Sonar: true, Gate: true}},
		{"secrets and headers", []string{"secrets", "headers"}, false, pipeline.ScanFlags{Secrets: true, Headers: true}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := buildScanFlags(tt.args, tt.gate); got != tt.want {
				t.Errorf("got %+v, want %+v", got, tt.want)
			}
		})
	}
}

// ── buildPerfFlags ────────────────────────────────────────────────────────────

func TestBuildPerfFlags(t *testing.T) {
	tests := []struct {
		name     string
		args     []string
		noBundle bool
		want     pipeline.PerfFlags
	}{
		{"empty", nil, false, pipeline.PerfFlags{}},
		{"k6 only", []string{"k6"}, false, pipeline.PerfFlags{K6: true}},
		{"no-bundle", nil, true, pipeline.PerfFlags{NoBundle: true}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := buildPerfFlags(tt.args, tt.noBundle); got != tt.want {
				t.Errorf("got %+v, want %+v", got, tt.want)
			}
		})
	}
}

// ── e2eConfigFrom / perfConfigFrom ───────────────────────────────────────────

func TestE2EConfigFrom_MapsFields(t *testing.T) {
	cfg := minimalTestConfig()
	e := e2eConfigFrom(cfg)

	if e.Shards != 4 {
		t.Errorf("Shards: got %d, want 4", e.Shards)
	}
	if e.BackendBasePort != 5151 {
		t.Errorf("BackendBasePort: got %d, want 5151", e.BackendBasePort)
	}
	if e.DBContainer != "studio_db" {
		t.Errorf("DBContainer: got %q, want studio_db", e.DBContainer)
	}
	if e.DevComposeFile != "docker-compose.dev.yml" {
		t.Errorf("DevComposeFile: got %q, want docker-compose.dev.yml", e.DevComposeFile)
	}
}

func TestPerfConfigFrom_MapsFields(t *testing.T) {
	cfg := minimalTestConfig()
	p := perfConfigFrom(cfg)

	if p.BackendPort != 5160 {
		t.Errorf("BackendPort: got %d, want 5160", p.BackendPort)
	}
	if p.FrontendPort != 3010 {
		t.Errorf("FrontendPort: got %d, want 3010", p.FrontendPort)
	}
	if p.DBSource != "controlroomdb_test" {
		t.Errorf("DBSource: got %q, want controlroomdb_test", p.DBSource)
	}
}
