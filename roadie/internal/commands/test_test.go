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

// ── buildUnitPipeline ─────────────────────────────────────────────────────────

func TestBuildUnitPipeline_AllTools(t *testing.T) {
	steps := buildUnitPipeline("/repo", nil)
	names := stepNames(steps)
	want := []string{"npm-install", "tsc", "jest", "ruff", "bandit", "pytest"}
	if len(names) != len(want) {
		t.Fatalf("step count: got %d (%v), want %d (%v)", len(names), names, len(want), want)
	}
	for i, n := range want {
		if names[i] != n {
			t.Errorf("step[%d]: got %q, want %q", i, names[i], n)
		}
	}
}

func TestBuildUnitPipeline_TscOnly(t *testing.T) {
	names := stepNames(buildUnitPipeline("/repo", []string{"tsc"}))
	if len(names) != 2 || names[0] != "npm-install" || names[1] != "tsc" {
		t.Errorf("unexpected steps: %v", names)
	}
}

func TestBuildUnitPipeline_PytestOnly(t *testing.T) {
	names := stepNames(buildUnitPipeline("/repo", []string{"pytest"}))
	if len(names) != 1 || names[0] != "pytest" {
		t.Errorf("unexpected steps: %v", names)
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

func TestBuildScanFlags_AllByDefault(t *testing.T) {
	f := buildScanFlags(nil, false)
	if !f.Sonar || !f.Trivy || !f.Secrets || !f.Headers {
		t.Errorf("expected all flags set for empty args, got %+v", f)
	}
}

func TestBuildScanFlags_TrivyOnly(t *testing.T) {
	f := buildScanFlags([]string{"trivy"}, false)
	if !f.Trivy || f.Sonar || f.Secrets || f.Headers {
		t.Errorf("expected only Trivy set, got %+v", f)
	}
}

func TestBuildScanFlags_SonarWithGate(t *testing.T) {
	f := buildScanFlags([]string{"sonar"}, true)
	if !f.Sonar || !f.Gate {
		t.Errorf("expected Sonar+Gate, got %+v", f)
	}
	if f.Trivy || f.Secrets || f.Headers {
		t.Errorf("expected only Sonar set, got %+v", f)
	}
}

func TestBuildScanFlags_MultipleChecks(t *testing.T) {
	f := buildScanFlags([]string{"secrets", "headers"}, false)
	if !f.Secrets || !f.Headers {
		t.Errorf("expected Secrets+Headers, got %+v", f)
	}
	if f.Sonar || f.Trivy {
		t.Errorf("expected only Secrets+Headers, got %+v", f)
	}
}

// ── buildPerfFlags ────────────────────────────────────────────────────────────

func TestBuildPerfFlags_Empty(t *testing.T) {
	f := buildPerfFlags(nil, false)
	if f.Bundle || f.Benchmarks || f.K6 || f.Lighthouse {
		t.Errorf("expected no suites selected for empty args, got %+v", f)
	}
}

func TestBuildPerfFlags_K6(t *testing.T) {
	f := buildPerfFlags([]string{"k6"}, false)
	if !f.K6 || f.Bundle || f.Benchmarks || f.Lighthouse {
		t.Errorf("expected only K6, got %+v", f)
	}
}

func TestBuildPerfFlags_NoBundle(t *testing.T) {
	f := buildPerfFlags(nil, true)
	if !f.NoBundle {
		t.Error("expected NoBundle=true")
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
