package pipeline

import (
	"strings"
	"testing"
)

// JUnit output is opt-in (ROADIE_JUNIT=1, set by the Woodpecker pipeline for Trunk Flaky Tests). Every report lands
// under <root>/reports/junit/<variant>/, the layout weyland-lab's trunk-upload.sh reads (one variant per directory).

func TestJUnitDir_OffByDefault(t *testing.T) {
	t.Setenv("ROADIE_JUNIT", "")
	if d := junitDir("/repo"); d != "" {
		t.Errorf("junitDir with ROADIE_JUNIT unset: got %q, want empty", d)
	}
}

func TestJUnitDir_OnlyExactlyOne(t *testing.T) {
	t.Setenv("ROADIE_JUNIT", "true")
	if d := junitDir("/repo"); d != "" {
		t.Errorf("junitDir with ROADIE_JUNIT=true: got %q, want empty (only \"1\" enables it)", d)
	}
}

func TestJUnitDir_On(t *testing.T) {
	t.Setenv("ROADIE_JUNIT", "1")
	if d := junitDir("/repo"); d != "/repo/reports/junit" {
		t.Errorf("junitDir: got %q, want /repo/reports/junit", d)
	}
}

func TestJestStep_NoJUnitReporterByDefault(t *testing.T) {
	t.Setenv("ROADIE_JUNIT", "")
	if args := strings.Join(JestStep("/repo", false).Args, " "); strings.Contains(args, "jest-junit") {
		t.Errorf("jest-junit reporter added without ROADIE_JUNIT: %v", args)
	}
}

func TestJestStep_JUnitReporter(t *testing.T) {
	t.Setenv("ROADIE_JUNIT", "1")
	args := strings.Join(JestStep("/repo", false).Args, " ")
	// Both reporters: replacing "default" would drop the console output the CI log relies on.
	if !strings.Contains(args, "--reporters=default --reporters=jest-junit") {
		t.Errorf("Args missing default + jest-junit reporters: %v", args)
	}
	// Containerized: the output dir must reach the container as an env var, not just roadie's own env.
	if !strings.Contains(args, "-e JEST_JUNIT_OUTPUT_DIR=/repo/reports/junit/jest") {
		t.Errorf("Args missing JEST_JUNIT_OUTPUT_DIR for the container: %v", args)
	}
}

func TestFastCheckPBTStep_JUnitReporter(t *testing.T) {
	t.Setenv("ROADIE_JUNIT", "1")
	s := fastCheckPBTStep("/repo", 100)
	if args := strings.Join(s.Args, " "); !strings.Contains(args, "--reporters=default --reporters=jest-junit") {
		t.Errorf("Args missing default + jest-junit reporters: %v", args)
	}
	if !containsEnv(s.Env, "JEST_JUNIT_OUTPUT_DIR=/repo/reports/junit/fast-check") {
		t.Errorf("Env missing JEST_JUNIT_OUTPUT_DIR for fast-check: %v", s.Env)
	}
}

func TestPytestStep_JUnitXML(t *testing.T) {
	t.Setenv("ROADIE_JUNIT", "1")
	if args := strings.Join(PytestStep("/repo").Args, " "); !strings.Contains(args, "--junitxml=/repo/reports/junit/pytest/unit.xml") {
		t.Errorf("Args missing --junitxml: %v", args)
	}
}

func TestPytestStep_NoJUnitXMLByDefault(t *testing.T) {
	t.Setenv("ROADIE_JUNIT", "")
	if args := strings.Join(PytestStep("/repo").Args, " "); strings.Contains(args, "--junitxml") {
		t.Errorf("--junitxml added without ROADIE_JUNIT: %v", args)
	}
}

func TestHypothesisPBTStep_JUnitXML(t *testing.T) {
	t.Setenv("ROADIE_JUNIT", "1")
	if args := strings.Join(hypothesisPBTStep("/repo", 100).Args, " "); !strings.Contains(args, "--junitxml='/repo/reports/junit/hypothesis/pbt.xml'") {
		t.Errorf("Args missing --junitxml: %v", args)
	}
}

func TestGoTestStep_GotestsumJUnit(t *testing.T) {
	t.Setenv("ROADIE_JUNIT", "1")
	args := strings.Join(GoTestStep("/repo").Args, " ")
	// gotestsum wraps the same go test flags after "--", so -race and the coverage profile Sonar reads are kept.
	if !strings.Contains(args, "gotestsum --junitfile /repo/reports/junit/go-test/gearlist.xml -- -race -coverprofile=coverage.out ./...") {
		t.Errorf("Args missing gotestsum wrapper: %v", args)
	}
}

func TestGoTestStep_PlainGoByDefault(t *testing.T) {
	t.Setenv("ROADIE_JUNIT", "")
	args := strings.Join(GoTestStep("/repo").Args, " ")
	if strings.Contains(args, "gotestsum") || !strings.Contains(args, "go test -race -coverprofile=coverage.out ./...") {
		t.Errorf("default go-test should be plain go test: %v", args)
	}
}

func TestGoTestPluginScannerStep_GotestsumJUnit(t *testing.T) {
	t.Setenv("ROADIE_JUNIT", "1")
	args := strings.Join(GoTestPluginScannerStep("/repo").Args, " ")
	if !strings.Contains(args, "gotestsum --junitfile /repo/reports/junit/go-test/plugin-scanner.xml -- -race -coverprofile=coverage.out ./...") {
		t.Errorf("Args missing gotestsum wrapper: %v", args)
	}
}

func containsEnv(env []string, want string) bool {
	for _, e := range env {
		if e == want {
			return true
		}
	}
	return false
}
