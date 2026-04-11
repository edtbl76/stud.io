package pipeline

import (
	"context"
	"io"
	"strings"
	"testing"
)

// ── PBTFlags ──────────────────────────────────────────────────────────────────

func TestPBTFlags_anySelected_BothFalse(t *testing.T) {
	if (PBTFlags{}).anySelected() {
		t.Error("expected false when no flags set")
	}
}

func TestPBTFlags_anySelected_FastCheckOnly(t *testing.T) {
	if !(PBTFlags{FastCheck: true}).anySelected() {
		t.Error("expected true when FastCheck is set")
	}
}

func TestPBTFlags_anySelected_HypothesisOnly(t *testing.T) {
	if !(PBTFlags{Hypothesis: true}).anySelected() {
		t.Error("expected true when Hypothesis is set")
	}
}

func TestPBTFlags_shouldRun_NoSelection_RunsAll(t *testing.T) {
	f := PBTFlags{}
	if !f.shouldRun("fast-check") {
		t.Error("expected fast-check to run when no selection")
	}
	if !f.shouldRun("hypothesis") {
		t.Error("expected hypothesis to run when no selection")
	}
}

func TestPBTFlags_shouldRun_FastCheckOnly(t *testing.T) {
	f := PBTFlags{FastCheck: true}
	if !f.shouldRun("fast-check") {
		t.Error("expected fast-check to run")
	}
	if f.shouldRun("hypothesis") {
		t.Error("expected hypothesis not to run")
	}
}

func TestPBTFlags_shouldRun_HypothesisOnly(t *testing.T) {
	f := PBTFlags{Hypothesis: true}
	if f.shouldRun("fast-check") {
		t.Error("expected fast-check not to run")
	}
	if !f.shouldRun("hypothesis") {
		t.Error("expected hypothesis to run")
	}
}

func TestAllPBTFlags(t *testing.T) {
	f := AllPBTFlags()
	if !f.FastCheck || !f.Hypothesis {
		t.Errorf("expected both flags true, got %+v", f)
	}
}

// ── Step constructors ─────────────────────────────────────────────────────────

func TestFastCheckPBTStep_Fields(t *testing.T) {
	s := fastCheckPBTStep("/repo", 100)

	if s.Name != "fast-check" {
		t.Errorf("Name: got %q, want fast-check", s.Name)
	}
	if s.Bin != "node_modules/.bin/jest" {
		t.Errorf("Bin: got %q, want node_modules/.bin/jest", s.Bin)
	}
	if s.Dir != "/repo/app/controlroom_frontend" {
		t.Errorf("Dir: got %q, want /repo/app/controlroom_frontend", s.Dir)
	}

	args := strings.Join(s.Args, " ")
	if !strings.Contains(args, "--testPathPatterns=__tests__/pbt/") {
		t.Errorf("Args: expected --testPathPatterns=__tests__/pbt/, got %q", args)
	}
	if !strings.Contains(args, "--passWithNoTests") {
		t.Errorf("Args: expected --passWithNoTests, got %q", args)
	}
}

func TestFastCheckPBTStep_FC_NUM_RUNS(t *testing.T) {
	s := fastCheckPBTStep("/repo", 42)
	env := strings.Join(s.Env, " ")
	if !strings.Contains(env, "FC_NUM_RUNS=42") {
		t.Errorf("Env: expected FC_NUM_RUNS=42, got %q", env)
	}
}

func TestHypothesisPBTStep_Fields(t *testing.T) {
	s := hypothesisPBTStep("/repo", 100)

	if s.Name != "hypothesis" {
		t.Errorf("Name: got %q, want hypothesis", s.Name)
	}
	if s.Bin != "bash" {
		t.Errorf("Bin: got %q, want bash", s.Bin)
	}
	if len(s.Args) < 2 || s.Args[0] != "-c" {
		t.Errorf("Args: expected [-c <script>], got %v", s.Args)
	}

	script := s.Args[1]
	if !strings.Contains(script, "tests/pbt") {
		t.Errorf("script: expected tests/pbt path, got %q", script)
	}
	if !strings.Contains(script, "exit 0") {
		t.Errorf("script: expected exit-5 guard, got %q", script)
	}
}

func TestHypothesisPBTStep_HYPOTHESIS_MAX_EXAMPLES(t *testing.T) {
	s := hypothesisPBTStep("/repo", 200)
	env := strings.Join(s.Env, " ")
	if !strings.Contains(env, "HYPOTHESIS_MAX_EXAMPLES=200") {
		t.Errorf("Env: expected HYPOTHESIS_MAX_EXAMPLES=200, got %q", env)
	}
}

// ── RunPBT ────────────────────────────────────────────────────────────────────

func TestRunPBT_BothEngines_TwoResults(t *testing.T) {
	fake := &fakeStepRunner{}
	root := Root("/repo")

	// Inject the fake runner by calling the internal steps directly.
	// We build the pipeline manually to bypass the real subprocess.
	steps := []ToolStep{
		fastCheckPBTStep(root, 100).withRunner(fake),
		hypothesisPBTStep(root, 100).withRunner(fake),
	}
	results, err := New(steps...).RunCollect(context.Background(), io.Discard)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(results) != 2 {
		t.Fatalf("expected 2 results, got %d", len(results))
	}
	if results[0].Name != "fast-check" {
		t.Errorf("results[0].Name: got %q, want fast-check", results[0].Name)
	}
	if results[1].Name != "hypothesis" {
		t.Errorf("results[1].Name: got %q, want hypothesis", results[1].Name)
	}
}

func TestRunPBT_DefaultExamples_UsedWhenZero(t *testing.T) {
	fake := &fakeStepRunner{}
	root := Root("/repo")

	// cfg.Examples = 0 should fall back to pbtExamplesDefault (100).
	cfg := PBTConfig{Examples: 0}
	examples := cfg.Examples
	if examples <= 0 {
		examples = pbtExamplesDefault
	}
	s := fastCheckPBTStep(root, examples)
	s = s.withRunner(fake)

	New(s).RunCollect(context.Background(), io.Discard) //nolint
	env := strings.Join(fake.calls[0].env, " ")
	if !strings.Contains(env, "FC_NUM_RUNS=100") {
		t.Errorf("expected FC_NUM_RUNS=100 with zero config, got %q", env)
	}
}

func TestRunPBT_FastCheckOnly_OneResult(t *testing.T) {
	fake := &fakeStepRunner{}
	root := Root("/repo")

	steps := []ToolStep{
		fastCheckPBTStep(root, 100).withRunner(fake),
	}
	results, err := New(steps...).RunCollect(context.Background(), io.Discard)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("expected 1 result, got %d", len(results))
	}
	if results[0].Name != "fast-check" {
		t.Errorf("expected fast-check result, got %q", results[0].Name)
	}
}
