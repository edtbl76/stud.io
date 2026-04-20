package pipeline

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"sync"
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
		// Overrides first so getenv() returns the override on duplicate keys.
		c.Env = append(cmd.env, os.Environ()...)
	}
	return c.Run()
}

// LabelWriter is an io.Writer that prefixes every completed line with "[label] ",
// replicating the sed -u 's/^/[label] /' pattern used in the run-*.sh scripts.
// Partial lines are buffered until a newline arrives. Once a downstream write
// fails, the error is stored and all subsequent Write and Flush calls fail fast.
type LabelWriter struct {
	mu    sync.Mutex
	label string
	out   io.Writer
	buf   []byte
	err   error // sticky — set on first downstream write failure
}

// NewLabelWriter returns a LabelWriter that writes to out with each line
// prefixed by "[label] ".
func NewLabelWriter(label string, out io.Writer) *LabelWriter {
	return &LabelWriter{label: label, out: out}
}

func (lw *LabelWriter) Write(p []byte) (int, error) {
	lw.mu.Lock()
	defer lw.mu.Unlock()
	if lw.err != nil {
		return 0, lw.err
	}
	lw.buf = append(lw.buf, p...)
	for {
		idx := bytes.IndexByte(lw.buf, '\n')
		if idx < 0 {
			break
		}
		if _, err := fmt.Fprintf(lw.out, "[%s] %s\n", lw.label, lw.buf[:idx]); err != nil {
			lw.err = err
			return 0, err
		}
		lw.buf = lw.buf[idx+1:]
	}
	return len(p), nil
}

// Flush writes any buffered bytes that have not yet been terminated by a
// newline. This handles subprocesses that exit without a trailing newline.
// Returns nil when there is nothing buffered.
func (lw *LabelWriter) Flush() error {
	lw.mu.Lock()
	defer lw.mu.Unlock()
	if lw.err != nil {
		return lw.err
	}
	if len(lw.buf) == 0 {
		return nil
	}
	_, err := fmt.Fprintf(lw.out, "[%s] %s\n", lw.label, lw.buf)
	lw.buf = lw.buf[:0]
	if err != nil {
		lw.err = err
	}
	return err
}

// ToolStep is a single tool invocation in a pipeline.
type ToolStep struct {
	Name string
	Bin  string
	Args []string
	Dir  string   // working directory; empty means inherit
	Env  []string // KEY=VALUE overrides; placed before os.Environ() so they win on duplicate keys
	run  stepRunner
}

// withRunner returns a copy of the step with the given runner injected.
// Used by tests and by Pipeline to propagate a shared fake runner.
func (s ToolStep) withRunner(r stepRunner) ToolStep {
	s.run = r
	return s
}

// Run executes the step, routing all output through a LabelWriter.
// Any bytes buffered without a trailing newline are flushed after the step
// completes. If the step succeeded but the flush failed, the flush error is
// returned. If both failed, both errors are returned via errors.Join.
func (s ToolStep) Run(ctx context.Context, out io.Writer) error {
	runner := s.run
	if runner == nil {
		runner = realStepRunner{}
	}
	lw := NewLabelWriter(s.Name, out)
	stepErr := runner.Run(ctx, lw, runCmd{
		dir:  s.Dir,
		env:  s.Env,
		name: s.Bin,
		args: s.Args,
	})
	flushErr := lw.Flush()
	return errors.Join(stepErr, flushErr)
}

// RunRaw executes the step writing output directly to out without a LabelWriter.
// Use when the subprocess produces \r-only progress lines that would stall the
// LabelWriter's newline-based flushing (e.g. npm install in non-CI contexts).
func (s ToolStep) RunRaw(ctx context.Context, out io.Writer) error {
	runner := s.run
	if runner == nil {
		runner = realStepRunner{}
	}
	return runner.Run(ctx, out, runCmd{
		dir:  s.Dir,
		env:  s.Env,
		name: s.Bin,
		args: s.Args,
	})
}

// StepResult records the outcome of a single step in a collect-mode pipeline.
type StepResult struct {
	Name     string
	Err      error
	Warn     bool // soft warning (e.g. Lighthouse LCP threshold exceeded)
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

// RunParallel runs all steps concurrently, collects every result, and returns
// the combined error. Use when steps are independent and a failure in one should
// not prevent others from running (e.g. parallel lint tools after a shared gate).
func (p *Pipeline) RunParallel(ctx context.Context, out io.Writer) ([]StepResult, error) {
	results := make([]StepResult, len(p.steps))
	var wg sync.WaitGroup
	for i, s := range p.steps {
		wg.Add(1)
		go func(i int, s ToolStep) {
			defer wg.Done()
			if p.run != nil {
				s = s.withRunner(p.run)
			}
			start := time.Now()
			results[i] = StepResult{Name: s.Name, Err: s.Run(ctx, out), Duration: time.Since(start)}
		}(i, s)
	}
	wg.Wait()
	return results, collectErrors(results)
}

// PrintSummary writes a PASS/WARN/FAIL table for a collect-mode run.
func PrintSummary(out io.Writer, results []StepResult) {
	fmt.Fprintln(out, "\n─── Summary ────────────────────────────────")
	for _, r := range results {
		status := stepStatus(r)
		fmt.Fprintf(out, "  %-20s %s  (%s)\n", r.Name, status, r.Duration.Round(time.Millisecond))
	}
	fmt.Fprintln(out, "────────────────────────────────────────────")
}

// PrintSummaryJSON writes results as a JSON array. Useful for CI parsing.
func PrintSummaryJSON(out io.Writer, results []StepResult) error {
	type jResult struct {
		Name       string `json:"name"`
		Status     string `json:"status"`
		DurationMs int64  `json:"duration_ms"`
	}
	arr := make([]jResult, 0, len(results))
	for _, r := range results {
		arr = append(arr, jResult{
			Name:       r.Name,
			Status:     stepStatus(r),
			DurationMs: r.Duration.Milliseconds(),
		})
	}
	enc := json.NewEncoder(out)
	enc.SetIndent("", "  ")
	return enc.Encode(arr)
}

// HasWarnings reports whether any result has Warn=true and no error.
func HasWarnings(results []StepResult) bool {
	for _, r := range results {
		if r.Warn && r.Err == nil {
			return true
		}
	}
	return false
}

func stepStatus(r StepResult) string {
	if r.Err != nil {
		return "FAIL"
	}
	if r.Warn {
		return "WARN"
	}
	return "PASS"
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
