package commands

import (
	"context"
	"io"
	"strings"
	"testing"

	"github.com/studiocontrolroom/roadie/internal/config"
)

// The command layer (buildCmd, releaseCmd) is wiring-only and tested via
// integration. Unit tests here cover the buildFlags helper methods.

func TestApplySchema_RejectsProductionDatabase(t *testing.T) {
	cfg := &config.Config{
		Providers: config.ProvidersConfig{
			Container: config.ContainerProviderConfig{ComposeFile: "docker-compose.yml"},
			Database:  config.DatabaseProviderConfig{DBName: "proddb", Service: "studio_db", User: "studio"},
		},
		Build: config.BuildConfig{
			SchemaFiles: []string{"schema.sql"},
			Databases:   []string{"testdb", "proddb"},
		},
	}
	err := applySchema(context.Background(), cfg, io.Discard)
	if err == nil {
		t.Fatal("expected error when production database is in build.databases, got nil")
	}
	if !strings.Contains(err.Error(), "proddb") {
		t.Errorf("expected error to name the database, got: %v", err)
	}
}

func TestApplySchema_AllowsTestDatabases(t *testing.T) {
	cfg := &config.Config{
		Providers: config.ProvidersConfig{
			Container: config.ContainerProviderConfig{ComposeFile: "docker-compose.yml"},
			Database:  config.DatabaseProviderConfig{DBName: "proddb", Service: "studio_db", User: "studio"},
		},
		Build: config.BuildConfig{
			SchemaFiles: []string{"schema.sql"},
			Databases:   []string{"testdb"},
		},
	}
	// guard should pass; provider will fail (no Docker) — confirm error is not the guard
	err := applySchema(context.Background(), cfg, io.Discard)
	if err != nil && strings.Contains(err.Error(), "refusing") {
		t.Errorf("guard should not have fired for a test-only database list, got: %v", err)
	}
}

func TestBuildFlags_RunE2E(t *testing.T) {
	tests := []struct {
		name  string
		flags buildFlags
		want  bool
	}{
		{"--e2e sets runE2E", buildFlags{e2e: true}, true},
		{"--full sets runE2E", buildFlags{full: true}, true},
		{"neither flag", buildFlags{}, false},
		{"--scan alone does not set runE2E", buildFlags{scan: true}, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.flags.runE2E(); got != tt.want {
				t.Errorf("runE2E() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestBuildFlags_RunScan(t *testing.T) {
	tests := []struct {
		name  string
		flags buildFlags
		want  bool
	}{
		{"--scan sets runScan", buildFlags{scan: true}, true},
		{"--full sets runScan", buildFlags{full: true}, true},
		{"neither flag", buildFlags{}, false},
		{"--e2e alone does not set runScan", buildFlags{e2e: true}, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.flags.runScan(); got != tt.want {
				t.Errorf("runScan() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestBuildFlags_RunPerf(t *testing.T) {
	tests := []struct {
		name  string
		flags buildFlags
		want  bool
	}{
		{"--perf sets runPerf", buildFlags{perf: true}, true},
		{"--full sets runPerf", buildFlags{full: true}, true},
		{"neither flag", buildFlags{}, false},
		{"--scan alone does not set runPerf", buildFlags{scan: true}, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.flags.runPerf(); got != tt.want {
				t.Errorf("runPerf() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestBuildFlags_Full_SetsAll(t *testing.T) {
	flags := buildFlags{full: true}
	if !flags.runE2E() {
		t.Error("--full must enable runE2E")
	}
	if !flags.runScan() {
		t.Error("--full must enable runScan")
	}
	if !flags.runPerf() {
		t.Error("--full must enable runPerf")
	}
}

func TestBuildFlags_SkipTests_Independent(t *testing.T) {
	// --skip-tests does not affect suite flags
	flags := buildFlags{skipTests: true, full: true}
	if !flags.runE2E() {
		t.Error("--skip-tests should not affect runE2E")
	}
	if !flags.runScan() {
		t.Error("--skip-tests should not affect runScan")
	}
	if !flags.runPerf() {
		t.Error("--skip-tests should not affect runPerf")
	}
}
