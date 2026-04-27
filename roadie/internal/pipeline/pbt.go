package pipeline

import (
	"context"
	"fmt"
	"io"
	"path/filepath"
	"strconv"
)

const pbtExamplesDefault = 100

// PBTConfig holds the configuration for property-based test runners.
type PBTConfig struct {
	Root     Root
	Examples int
}

// PBTFlags controls which PBT engines run. All false means run all.
type PBTFlags struct {
	FastCheck  bool
	Hypothesis bool
}

// anySelected reports whether a specific engine was selected.
func (f PBTFlags) anySelected() bool {
	return f.FastCheck || f.Hypothesis
}

// shouldRun reports whether engine should run given the active flag selection.
// When no engine is selected, all engines run.
func (f PBTFlags) shouldRun(engine string) bool {
	if !f.anySelected() {
		return true
	}
	switch engine {
	case "fast-check":
		return f.FastCheck
	case "hypothesis":
		return f.Hypothesis
	}
	return false
}

// AllPBTFlags returns flags that run all PBT engines.
func AllPBTFlags() PBTFlags {
	return PBTFlags{FastCheck: true, Hypothesis: true}
}

// RunPBT runs fast-check and/or hypothesis property-based tests. Both engines
// run regardless of individual failure so the full picture is always visible.
// Returns one StepResult per engine selected and a combined error.
func RunPBT(ctx context.Context, cfg PBTConfig, flags PBTFlags, out io.Writer) ([]StepResult, error) {
	examples := cfg.Examples
	if examples <= 0 {
		examples = pbtExamplesDefault
	}

	var steps []ToolStep
	if flags.shouldRun("fast-check") {
		steps = append(steps, fastCheckPBTStep(cfg.Root, examples))
	}
	if flags.shouldRun("hypothesis") {
		steps = append(steps, hypothesisPBTStep(cfg.Root, examples))
	}
	if len(steps) == 0 {
		fmt.Fprintln(out, "[pbt] No engines selected.")
		return nil, nil
	}

	return New(steps...).RunCollect(ctx, out)
}

// fastCheckPBTStep returns a step that runs Jest against files under __tests__/pbt/
// with FC_NUM_RUNS set to examples. Uses --passWithNoTests so the command
// succeeds when no property tests exist yet.
func fastCheckPBTStep(root Root, examples int) ToolStep {
	r := string(root)
	return ToolStep{
		Name: "fast-check",
		Bin:  filepath.Join("node_modules", ".bin", "jest"),
		Args: []string{
			"--testPathPatterns=__tests__/pbt/",
			"--passWithNoTests",
		},
		Dir: filepath.Join(r, frontendDir),
		Env: append(pathEnv(ResolveNode()), "FC_NUM_RUNS="+strconv.Itoa(examples)),
	}
}

// hypothesisPBTStep returns a step that runs pytest against tests/pbt/ with
// HYPOTHESIS_MAX_EXAMPLES set to examples. The bash wrapper converts exit
// code 5 (no tests collected) to 0 so the command succeeds when no property
// tests exist yet.
func hypothesisPBTStep(root Root, examples int) ToolStep {
	r := string(root)
	testDir := filepath.Join(r, backendDir, "tests", "pbt")
	script := fmt.Sprintf(
		`python -m pytest '%s' -q --tb=short; s=$?; [ $s -eq 5 ] && exit 0 || exit $s`,
		testDir,
	)
	return ToolStep{
		Name: "hypothesis",
		Bin:  "bash",
		Args: []string{"-c", script},
		Env:  append(pathEnv(ResolvePython()), "HYPOTHESIS_MAX_EXAMPLES="+strconv.Itoa(examples)),
	}
}
