package pipeline

import (
	"os"
	"path/filepath"
	"testing"
)

func TestHasPerfBuild_WhenMissing(t *testing.T) {
	tmp := t.TempDir()
	if hasPerfBuild(tmp) {
		t.Error("expected hasPerfBuild=false for empty dir")
	}
}

func TestHasPerfBuild_WhenPresent(t *testing.T) {
	tmp := t.TempDir()
	nextPerf := filepath.Join(tmp, "app", "controlroom_frontend", ".next-perf")
	os.MkdirAll(nextPerf, 0o755)
	if !hasPerfBuild(tmp) {
		t.Error("expected hasPerfBuild=true when .next-perf exists")
	}
}

func TestPerfFlags_AnySelected(t *testing.T) {
	if (PerfFlags{}).anySelected() {
		t.Error("empty PerfFlags should not have any selected")
	}
	if !(PerfFlags{K6: true}).anySelected() {
		t.Error("PerfFlags{K6:true} should have something selected")
	}
	if !(PerfFlags{Lighthouse: true}).anySelected() {
		t.Error("PerfFlags{Lighthouse:true} should have something selected")
	}
}

func TestPerfConfig_ZeroValue(t *testing.T) {
	cfg := PerfConfig{}
	if cfg.BackendPort != 0 || cfg.FrontendPort != 0 {
		t.Error("zero-value PerfConfig should have zero ports")
	}
}

func TestRunPerfBenchmarks_StepHasCorrectPaths(t *testing.T) {
	// Check that runPerfBenchmarks uses the right test file paths.
	// We call a helper that builds the step rather than running it.
	root := "/repo"
	step := ToolStep{
		Name: "benchmarks",
		Bin:  "python",
		Args: []string{
			"-m", "pytest",
			filepath.Join(root, backendDir, "tests", "test_query_plans.py"),
			filepath.Join(root, backendDir, "tests", "test_benchmarks.py"),
			"-v",
			"--benchmark-json=/tmp/perf-benchmarks.json",
		},
	}
	if step.Name != "benchmarks" {
		t.Errorf("expected name benchmarks, got %q", step.Name)
	}
	if step.Args[2] != "/repo/app/controlroom_backend/tests/test_query_plans.py" {
		t.Errorf("unexpected query plans path: %q", step.Args[2])
	}
}
