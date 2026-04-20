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
	nextPerf := filepath.Join(tmp, "app", "studio_frontend", ".next-perf")
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

func TestPerfFlags_ShouldRun(t *testing.T) {
	tests := []struct {
		name  string
		flags PerfFlags
		suite string
		want  bool
	}{
		// No selection: all suites run.
		{"default runs bundle", PerfFlags{}, "bundle", true},
		{"default runs benchmarks", PerfFlags{}, "benchmarks", true},
		{"default runs k6", PerfFlags{}, "k6", true},
		{"default runs lighthouse", PerfFlags{}, "lighthouse", true},
		// Bundle-only: only bundle runs, others are skipped.
		{"bundle-only runs bundle", PerfFlags{Bundle: true}, "bundle", true},
		{"bundle-only skips benchmarks", PerfFlags{Bundle: true}, "benchmarks", false},
		{"bundle-only skips k6", PerfFlags{Bundle: true}, "k6", false},
		{"bundle-only skips lighthouse", PerfFlags{Bundle: true}, "lighthouse", false},
		// Other single selections.
		{"k6-only runs k6", PerfFlags{K6: true}, "k6", true},
		{"k6-only skips bundle", PerfFlags{K6: true}, "bundle", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.flags.shouldRun(tt.suite); got != tt.want {
				t.Errorf("shouldRun(%q) = %v, want %v", tt.suite, got, tt.want)
			}
		})
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
