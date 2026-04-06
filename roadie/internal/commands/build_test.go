package commands

import "testing"

// The command layer (buildCmd, releaseCmd) is wiring-only and tested via
// integration. Unit tests here cover the buildFlags helper methods.

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
	if !flags.runE2E() || !flags.runScan() || !flags.runPerf() {
		t.Error("--full must enable runE2E, runScan, and runPerf")
	}
}

func TestBuildFlags_SkipTests_Independent(t *testing.T) {
	// --skip-tests does not affect suite flags
	flags := buildFlags{skipTests: true, full: true}
	if !flags.runE2E() || !flags.runScan() || !flags.runPerf() {
		t.Error("--skip-tests should not affect e2e/scan/perf flags")
	}
}
