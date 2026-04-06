package pipeline

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"time"
)

// runCmd holds the parameters for a single tool invocation.
// Grouping them avoids an excess-argument signature on stepRunner.Run.
type runCmd struct {
	dir  string
	env  []string
	name string
	args []string
}

// stepRunner abstracts shell command execution so pipeline steps can be tested
// without spawning real processes. Unlike providers.cmdRunner, it carries Dir
// and Env because every step may run in a different working directory with
// different environment variables.
type stepRunner interface {
	Run(ctx context.Context, out io.Writer, cmd runCmd) error
}

type realStepRunner struct{}

func (realStepRunner) Run(ctx context.Context, out io.Writer, cmd runCmd) error {
	c := exec.CommandContext(ctx, cmd.name, cmd.args...)
	c.Stdout = out
	c.Stderr = out
	if cmd.dir != "" {
		c.Dir = cmd.dir
	}
	if len(cmd.env) > 0 {
		c.Env = append(os.Environ(), cmd.env...)
	}
	return c.Run()
}

// LabelWriter is an io.Writer that prefixes every completed line with "[label] ",
// replicating the sed -u 's/^/[label] /' pattern used in the run-*.sh scripts.
// Partial lines are buffered until a newline arrives.
type LabelWriter struct {
	label string
	out   io.Writer
	buf   []byte
}

// NewLabelWriter returns a LabelWriter that writes to out with each line
// prefixed by "[label] ".
func NewLabelWriter(label string, out io.Writer) *LabelWriter {
	return &LabelWriter{label: label, out: out}
}

func (lw *LabelWriter) Write(p []byte) (int, error) {
	lw.buf = append(lw.buf, p...)
	for {
		idx := bytes.IndexByte(lw.buf, '\n')
		if idx < 0 {
			break
		}
		fmt.Fprintf(lw.out, "[%s] %s\n", lw.label, lw.buf[:idx])
		lw.buf = lw.buf[idx+1:]
	}
	return len(p), nil
}

// ToolStep is a single tool invocation in a pipeline.
type ToolStep struct {
	Name string
	Bin  string
	Args []string
	Dir  string   // working directory; empty means inherit
	Env  []string // additional KEY=VALUE pairs prepended to the environment
	run  stepRunner
}

// withRunner returns a copy of the step with the given runner injected.
// Used by tests and by Pipeline to propagate a shared fake runner.
func (s ToolStep) withRunner(r stepRunner) ToolStep {
	s.run = r
	return s
}

// Run executes the step, routing all output through a LabelWriter.
func (s ToolStep) Run(ctx context.Context, out io.Writer) error {
	runner := s.run
	if runner == nil {
		runner = realStepRunner{}
	}
	return runner.Run(ctx, NewLabelWriter(s.Name, out), runCmd{
		dir:  s.Dir,
		env:  s.Env,
		name: s.Bin,
		args: s.Args,
	})
}

// StepResult records the outcome of a single step in a collect-mode pipeline.
// It is the building block for Phase 6's --json output (PipelineError).
type StepResult struct {
	Name     string
	Err      error
	Duration time.Duration
}

// Pipeline sequences ToolSteps.
type Pipeline struct {
	steps []ToolStep
	run   stepRunner // non-nil only when injected by withRunner (tests)
}

// New creates a Pipeline from the given steps.
func New(steps ...ToolStep) *Pipeline {
	return &Pipeline{steps: steps}
}

// withRunner returns a copy of the pipeline with a shared runner injected into
// every step. Used by tests to avoid spawning real processes.
func (p *Pipeline) withRunner(r stepRunner) *Pipeline {
	p2 := *p
	p2.run = r
	return &p2
}

// RunSequential runs each step in order, stopping and returning on the first
// failure. Use for unit-test sequences where a failed compile makes later steps
// meaningless.
func (p *Pipeline) RunSequential(ctx context.Context, out io.Writer) error {
	for _, s := range p.steps {
		if p.run != nil {
			s = s.withRunner(p.run)
		}
		if err := s.Run(ctx, out); err != nil {
			return fmt.Errorf("step %q failed: %w", s.Name, err)
		}
	}
	return nil
}

// RunCollect runs all steps regardless of individual failures, then returns the
// results and a combined error. Use for scan/perf sequences where a full picture
// is more valuable than stopping at the first failure.
func (p *Pipeline) RunCollect(ctx context.Context, out io.Writer) ([]StepResult, error) {
	results := make([]StepResult, 0, len(p.steps))
	for _, s := range p.steps {
		if p.run != nil {
			s = s.withRunner(p.run)
		}
		start := time.Now()
		err := s.Run(ctx, out)
		results = append(results, StepResult{Name: s.Name, Err: err, Duration: time.Since(start)})
	}
	return results, collectErrors(results)
}

// PrintSummary writes a PASS/FAIL table for a collect-mode run.
func PrintSummary(out io.Writer, results []StepResult) {
	fmt.Fprintln(out, "\n─── Summary ────────────────────────────────")
	for _, r := range results {
		status := "PASS"
		if r.Err != nil {
			status = "FAIL"
		}
		fmt.Fprintf(out, "  %-20s %s  (%s)\n", r.Name, status, r.Duration.Round(time.Millisecond))
	}
	fmt.Fprintln(out, "────────────────────────────────────────────")
}

func collectErrors(results []StepResult) error {
	var errs []error
	for _, r := range results {
		if r.Err != nil {
			errs = append(errs, fmt.Errorf("%s: %w", r.Name, r.Err))
		}
	}
	return errors.Join(errs...)
}
