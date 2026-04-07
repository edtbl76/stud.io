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

func assertStepNames(t *testing.T, steps []pipeline.ToolStep, want []string) {
	t.Helper()
	got := stepNames(steps)
	if len(got) != len(want) {
		t.Fatalf("step count: got %d (%v), want %d (%v)", len(got), got, len(want), want)
	}
	for i, name := range want {
		if got[i] != name {
			t.Errorf("step[%d]: got %q, want %q", i, got[i], name)
		}
	}
}

// ── buildUnitPipeline ─────────────────────────────────────────────────────────

func TestBuildUnitPipeline_AllTools(t *testing.T) {
	assertStepNames(t, buildUnitPipeline("/repo", nil),
		[]string{"npm-install", "tsc", "jest", "pytest"})
}

func TestBuildUnitPipeline_TscOnly(t *testing.T) {
	assertStepNames(t, buildUnitPipeline("/repo", []string{"tsc"}),
		[]string{"npm-install", "tsc"})
}

func TestBuildUnitPipeline_PytestOnly(t *testing.T) {
	assertStepNames(t, buildUnitPipeline("/repo", []string{"pytest"}),
		[]string{"pytest"})
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

// ── scanSteps ─────────────────────────────────────────────────────────────────

func TestScanSteps_AllByDefault(t *testing.T) {
	steps := scanSteps("/repo", nil, false)
	// sonar(1) + trivy(2: backend+frontend) + detect-secrets(1) + headers(1) = 5
	if len(steps) != 5 {
		t.Fatalf("expected 5 steps, got %d: %v", len(steps), stepNames(steps))
	}
}

func TestScanSteps_TrivyOnly(t *testing.T) {
	assertStepNames(t, scanSteps("/repo", []string{"trivy"}, false),
		[]string{"trivy-controlroom_backend", "trivy-controlroom_frontend"})
}

func TestScanSteps_SonarGate(t *testing.T) {
	steps := scanSteps("/repo", []string{"sonar"}, true)
	if len(steps) != 1 {
		t.Fatalf("expected 1 step, got %d", len(steps))
	}
	if steps[0].Name != "sonar" {
		t.Errorf("expected sonar step, got %q", steps[0].Name)
	}
	args := strings.Join(steps[0].Args, " ")
	if !strings.Contains(args, "--sonar-gate") {
		t.Errorf("expected --sonar-gate in args, got: %q", args)
	}
}

func TestScanSteps_SingleCheck_Secrets(t *testing.T) {
	steps := scanSteps("/repo", []string{"secrets"}, false)
	if len(steps) != 1 || steps[0].Name != "detect-secrets" {
		t.Errorf("expected detect-secrets step, got: %v", stepNames(steps))
	}
}

// ── subtypesToFlags ───────────────────────────────────────────────────────────

func TestSubtypesToFlags_EmptyArgs(t *testing.T) {
	got := subtypesToFlags(nil, perfFlagMap)
	if got != nil {
		t.Errorf("expected nil for empty args, got %v", got)
	}
}

func TestSubtypesToFlags_SingleArg(t *testing.T) {
	got := subtypesToFlags([]string{"bundle"}, perfFlagMap)
	if len(got) != 1 || got[0] != "--bundle" {
		t.Errorf("expected [--bundle], got %v", got)
	}
}

func TestSubtypesToFlags_MultipleArgs(t *testing.T) {
	got := subtypesToFlags([]string{"bundle", "k6"}, perfFlagMap)
	joined := strings.Join(got, " ")
	if !strings.Contains(joined, "--bundle") || !strings.Contains(joined, "--k6") {
		t.Errorf("expected --bundle and --k6 in flags, got %v", got)
	}
}

// ── PerfStep variadic args ────────────────────────────────────────────────────

func TestPerfStep_NoExtraArgs(t *testing.T) {
	s := pipeline.PerfStep("/repo")
	if !strings.Contains(strings.Join(s.Args, " "), "test-perf.sh") {
		t.Errorf("expected test-perf.sh in args, got %v", s.Args)
	}
}

func TestPerfStep_NoBundleFlag(t *testing.T) {
	s := pipeline.PerfStep("/repo", "--no-bundle")
	args := strings.Join(s.Args, " ")
	if !strings.Contains(args, "--no-bundle") {
		t.Errorf("expected --no-bundle in args, got %q", args)
	}
}

func TestPerfStep_SubtypeMapping(t *testing.T) {
	s := pipeline.PerfStep("/repo", "--bundle", "--k6")
	args := strings.Join(s.Args, " ")
	if !strings.Contains(args, "--bundle") || !strings.Contains(args, "--k6") {
		t.Errorf("expected --bundle and --k6 in args, got %q", args)
	}
}
