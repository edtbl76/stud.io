package commands

import (
	"strings"
	"testing"

	"github.com/studiocontrolroom/roadie/internal/config"
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
		{"all tools", nil, []string{"npm-install", "tsc", "jest", "ruff", "bandit", "pytest", "go-test", "go-test-scanner"}},
		{"tsc only", []string{"tsc"}, []string{"npm-install", "tsc"}},
		{"pytest only", []string{"pytest"}, []string{"pytest"}},
		{"pip-audit only", []string{"pip-audit"}, []string{"pip-audit"}},
		{"npm-audit only", []string{"npm-audit"}, []string{"npm-install", "npm-audit"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assertSteps(t, stepNames(buildUnitPipeline("/repo", tt.tools, true)), tt.want)
		})
	}
}

func TestBuildUnitPipeline_PytestHasBenchmarkSkip(t *testing.T) {
	steps := buildUnitPipeline("/repo", []string{"pytest"}, true)
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
		{"all by default", nil, false, pipeline.ScanFlags{Sonar: true, Trivy: true, Secrets: true, Headers: true, Govulncheck: true, Gosec: true, Staticcheck: true}},
		{"trivy only", []string{"trivy"}, false, pipeline.ScanFlags{Trivy: true}},
		{"sonar with gate", []string{"sonar"}, true, pipeline.ScanFlags{Sonar: true, Gate: true}},
		{"secrets and headers", []string{"secrets", "headers"}, false, pipeline.ScanFlags{Secrets: true, Headers: true}},
		{"govulncheck only", []string{"govulncheck"}, false, pipeline.ScanFlags{Govulncheck: true}},
		{"gosec and staticcheck", []string{"gosec", "staticcheck"}, false, pipeline.ScanFlags{Gosec: true, Staticcheck: true}},
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

// ── validateE2EConfig / validatePerfConfig ────────────────────────────────────

func TestValidateE2EConfig_PassesWithFullConfig(t *testing.T) {
	if err := validateE2EConfig(minimalTestConfig()); err != nil {
		t.Errorf("unexpected error for full config: %v", err)
	}
}

func TestValidateE2EConfig_RejectsZeroConfig(t *testing.T) {
	tests := []struct {
		name    string
		mutate  func(*config.Config)
		wantErr string
	}{
		{"zero shards", func(c *config.Config) { c.Test.E2E.Shards = 0 }, "shards"},
		{"empty backend service", func(c *config.Config) { c.Test.E2E.BackendService = "" }, "backend_service"},
		{"zero backend port", func(c *config.Config) { c.Test.E2E.BackendBasePort = 0 }, "backend_base_port"},
		{"zero frontend port", func(c *config.Config) { c.Test.E2E.FrontendBasePort = 0 }, "frontend_base_port"},
		{"empty db container", func(c *config.Config) { c.Test.DB.Container = "" }, "container"},
		{"empty db source", func(c *config.Config) { c.Test.DB.Source = "" }, "source"},
		{"empty gearlist service", func(c *config.Config) { c.Test.E2E.GearlistService = "" }, "gearlist_service"},
		{"zero gearlist port", func(c *config.Config) { c.Test.E2E.GearlistPort = 0 }, "gearlist_port"},
		{"zero gearlist internal port", func(c *config.Config) { c.Test.E2E.GearlistInternalPort = 0 }, "gearlist_internal_port"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cfg := minimalTestConfig()
			tt.mutate(cfg)
			err := validateE2EConfig(cfg)
			if err == nil {
				t.Fatal("expected error, got nil")
			}
			if !strings.Contains(err.Error(), tt.wantErr) {
				t.Errorf("error %q does not mention %q", err.Error(), tt.wantErr)
			}
		})
	}
}

func TestValidatePerfConfig_PassesWithFullConfig(t *testing.T) {
	if err := validatePerfConfig(minimalTestConfig()); err != nil {
		t.Errorf("unexpected error for full config: %v", err)
	}
}

func TestValidatePerfConfig_RejectsZeroConfig(t *testing.T) {
	tests := []struct {
		name    string
		mutate  func(*config.Config)
		wantErr string
	}{
		{"zero backend port", func(c *config.Config) { c.Test.Perf.BackendPort = 0 }, "backend_port"},
		{"zero frontend port", func(c *config.Config) { c.Test.Perf.FrontendPort = 0 }, "frontend_port"},
		{"empty backend service", func(c *config.Config) { c.Test.E2E.BackendService = "" }, "backend_service"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cfg := minimalTestConfig()
			tt.mutate(cfg)
			err := validatePerfConfig(cfg)
			if err == nil {
				t.Fatal("expected error, got nil")
			}
			if !strings.Contains(err.Error(), tt.wantErr) {
				t.Errorf("error %q does not mention %q", err.Error(), tt.wantErr)
			}
		})
	}
}

// ── buildPBTFlags ─────────────────────────────────────────────────────────────

func TestBuildPBTFlags(t *testing.T) {
	tests := []struct {
		name string
		args []string
		want pipeline.PBTFlags
	}{
		{"empty runs all", nil, pipeline.PBTFlags{FastCheck: true, Hypothesis: true, Rapid: true}},
		{"fast-check only", []string{"fast-check"}, pipeline.PBTFlags{FastCheck: true}},
		{"hypothesis only", []string{"hypothesis"}, pipeline.PBTFlags{Hypothesis: true}},
		{"rapid only", []string{"rapid"}, pipeline.PBTFlags{Rapid: true}},
		{"both explicit", []string{"fast-check", "hypothesis"}, pipeline.PBTFlags{FastCheck: true, Hypothesis: true}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := buildPBTFlags(tt.args); got != tt.want {
				t.Errorf("got %+v, want %+v", got, tt.want)
			}
		})
	}
}

// ── pbtConfigFrom ─────────────────────────────────────────────────────────────

func TestPBTConfigFrom_MapsExamples(t *testing.T) {
	cfg := minimalTestConfig()
	p := pbtConfigFrom("/repo", cfg)
	if p.Examples != 50 {
		t.Errorf("Examples: got %d, want 50", p.Examples)
	}
	if p.Root != "/repo" {
		t.Errorf("Root: got %q, want /repo", p.Root)
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
	if p.DBSource != "masterdb_test" {
		t.Errorf("DBSource: got %q, want masterdb_test", p.DBSource)
	}
}
