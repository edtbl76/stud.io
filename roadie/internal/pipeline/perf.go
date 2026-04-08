package pipeline

import (
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"time"
)

// PerfConfig holds everything the perf runner needs, including the repo root.
type PerfConfig struct {
	BackendPort    int
	FrontendPort   int
	CarbonURL      string
	BackendService string
	DBSource       string
	// compose file + project for starting the perf backend container
	DevComposeFile        string
	BackendComposeProject string
	BackendInternalPort   int
	// Root is the absolute path to the repository root.
	Root string
}

// PerfFlags controls which perf suites run. All false means run everything.
type PerfFlags struct {
	Bundle     bool
	Benchmarks bool
	K6         bool
	Lighthouse bool
	NoBundle   bool
}

// anySelected reports whether any specific suite was selected.
func (f PerfFlags) anySelected() bool {
	return f.Bundle || f.Benchmarks || f.K6 || f.Lighthouse
}

// shouldRun reports whether suite should run given the active flag selection.
// When no specific suite is selected, all suites run. "bundle" maps to the
// frontend build step that runs in prepareFrontend; its result is recorded in
// collect so that "roadie test perf bundle" produces visible output.
func (f PerfFlags) shouldRun(suite string) bool {
	if !f.anySelected() {
		return true
	}
	switch suite {
	case "bundle":
		return f.Bundle
	case "benchmarks":
		return f.Benchmarks
	case "k6":
		return f.K6
	case "lighthouse":
		return f.Lighthouse
	}
	return false
}

// perfRunner holds immutable config for the duration of a perf run.
type perfRunner struct {
	cfg PerfConfig
}

// RunPerf orchestrates the full performance test suite: start backend →
// build frontend → start Next.js prod server → benchmarks → k6 → Lighthouse.
func RunPerf(ctx context.Context, cfg PerfConfig, flags PerfFlags, out io.Writer) ([]StepResult, error) {
	return perfRunner{cfg}.run(ctx, flags, out)
}

func (r perfRunner) run(ctx context.Context, flags PerfFlags, out io.Writer) ([]StepResult, error) {
	container := r.cfg.BackendService + "_perf"

	if err := r.startBackend(ctx, container, out); err != nil {
		return nil, err
	}
	defer stopPerfBackend(container)

	if err := r.prepareFrontend(ctx, flags, out); err != nil {
		return nil, err
	}

	frontendProc, err := startFrontendProd(ctx, r.cfg, r.cfg.Root, out)
	if err != nil {
		return nil, err
	}
	defer func() {
		frontendProc.Kill() //nolint
		if !flags.NoBundle {
			os.RemoveAll(filepath.Join(r.cfg.Root, "app", "controlroom_frontend", ".next-perf"))
		}
	}()

	url := fmt.Sprintf("http://localhost:%d", r.cfg.FrontendPort)
	if err := waitForHTTP(ctx, url, 30, 2*time.Second); err != nil {
		return nil, fmt.Errorf("frontend health: %w", err)
	}

	return r.collect(ctx, flags, out)
}

// prepareFrontend either builds the frontend production bundle or verifies an
// existing build is present when --no-bundle is active.
func (r perfRunner) prepareFrontend(ctx context.Context, flags PerfFlags, out io.Writer) error {
	if !flags.NoBundle {
		return buildFrontend(ctx, r.cfg, r.cfg.Root, out)
	}
	if !hasPerfBuild(r.cfg.Root) {
		return fmt.Errorf("--no-bundle: .next-perf not found — run without --no-bundle first")
	}
	return nil
}

func (r perfRunner) startBackend(ctx context.Context, container string, out io.Writer) error {
	fmt.Fprintf(out, "[perf] Starting backend on port %d (DB: %s)...\n", r.cfg.BackendPort, r.cfg.DBSource)
	exec.CommandContext(ctx, "docker", "rm", "-f", container).Run() //nolint
	cmd := exec.CommandContext(ctx, "docker", "compose",
		"-f", filepath.Join(r.cfg.Root, r.cfg.DevComposeFile),
		"-p", r.cfg.BackendComposeProject,
		"run", "-d",
		"--name", container,
		"-p", fmt.Sprintf("%d:%d", r.cfg.BackendPort, r.cfg.BackendInternalPort),
		"-e", "DB_NAME="+r.cfg.DBSource,
		r.cfg.BackendService,
	)
	cmd.Stdout = out
	cmd.Stderr = out
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("starting perf backend: %w", err)
	}
	url := fmt.Sprintf("http://localhost:%d/health", r.cfg.BackendPort)
	return waitForHTTP(ctx, url, 30, 2*time.Second)
}

// collect runs the selected perf suites and returns StepResults.
// The bundle build ran in prepareFrontend; a success result is recorded here
// when bundle was selected so "roadie test perf bundle" has visible output.
func (r perfRunner) collect(ctx context.Context, flags PerfFlags, out io.Writer) ([]StepResult, error) {
	var results []StepResult

	if flags.shouldRun("bundle") && !flags.NoBundle {
		results = append(results, StepResult{Name: "bundle"})
	}
	if flags.shouldRun("benchmarks") {
		results = append(results, runPerfBenchmarks(ctx, r.cfg.Root, out))
	}
	if flags.shouldRun("k6") {
		results = append(results, runPerfK6(ctx, r.cfg, r.cfg.Root, out)...)
	}
	if flags.shouldRun("lighthouse") {
		results = append(results, runPerfLighthouse(ctx, r.cfg, r.cfg.Root, out))
	}

	if r.cfg.CarbonURL != "" {
		runCarbonReport(r.cfg.CarbonURL, r.cfg.Root, out)
	}

	return results, collectErrors(results)
}

func stopPerfBackend(container string) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	exec.CommandContext(ctx, "docker", "rm", "-f", container).Run() //nolint
}

func buildFrontend(ctx context.Context, cfg PerfConfig, root string, out io.Writer) error {
	fmt.Fprintln(out, "[perf] Building frontend (production + bundle analysis)...")
	frontendDir := filepath.Join(root, "app", "controlroom_frontend")
	nodeDir := ResolveNode()
	cmd := exec.CommandContext(ctx, "npx", "next", "build")
	cmd.Dir = frontendDir
	cmd.Env = os.Environ()
	if nodeDir != "" {
		cmd.Env = append(cmd.Env, "PATH="+nodeDir+":"+os.Getenv("PATH"))
	}
	cmd.Env = append(cmd.Env,
		"NEXT_DIST_DIR=.next-perf",
		"ANALYZE=true",
		fmt.Sprintf("BACKEND_URL=http://localhost:%d", cfg.BackendPort),
	)
	lw := NewLabelWriter("next-build", out)
	cmd.Stdout = lw
	cmd.Stderr = lw
	err := cmd.Run()
	lw.Flush() //nolint
	return err
}

func hasPerfBuild(root string) bool {
	_, err := os.Stat(filepath.Join(root, "app", "controlroom_frontend", ".next-perf"))
	return err == nil
}

func startFrontendProd(ctx context.Context, cfg PerfConfig, root string, out io.Writer) (*os.Process, error) {
	fmt.Fprintf(out, "[perf] Starting frontend on port %d...\n", cfg.FrontendPort)
	frontendDir := filepath.Join(root, "app", "controlroom_frontend")
	nodeDir := ResolveNode()

	cmd := exec.CommandContext(ctx, "npx", "next", "start",
		"-p", fmt.Sprintf("%d", cfg.FrontendPort), "-H", "127.0.0.1",
	)
	cmd.Dir = frontendDir
	cmd.Env = os.Environ()
	if nodeDir != "" {
		cmd.Env = append(cmd.Env, "PATH="+nodeDir+":"+os.Getenv("PATH"))
	}
	cmd.Env = append(cmd.Env,
		"NEXT_DIST_DIR=.next-perf",
		fmt.Sprintf("BACKEND_URL=http://localhost:%d", cfg.BackendPort),
	)
	logFile, err := os.Create("/tmp/perf-frontend.log")
	if err != nil {
		return nil, fmt.Errorf("creating perf frontend log: %w", err)
	}
	cmd.Stdout = logFile
	cmd.Stderr = logFile
	if err := cmd.Start(); err != nil {
		logFile.Close()
		return nil, fmt.Errorf("starting perf frontend: %w", err)
	}
	logFile.Close() // parent's copy; child process holds its own inherited fd
	return cmd.Process, nil
}

func runPerfBenchmarks(ctx context.Context, root string, out io.Writer) StepResult {
	start := time.Now()
	backendDir := filepath.Join(root, "app", "controlroom_backend")
	step := ToolStep{
		Name: "benchmarks",
		Bin:  "python",
		Args: []string{
			"-m", "pytest",
			filepath.Join(backendDir, "tests", "test_query_plans.py"),
			filepath.Join(backendDir, "tests", "test_benchmarks.py"),
			"-v",
			"--benchmark-json=/tmp/perf-benchmarks.json",
		},
		Dir: root,
		Env: pathEnv(ResolvePython()),
	}
	err := step.Run(ctx, out)
	return StepResult{Name: "benchmarks", Err: err, Duration: time.Since(start)}
}

func runPerfK6(ctx context.Context, cfg PerfConfig, root string, out io.Writer) []StepResult {
	if _, err := exec.LookPath("k6"); err != nil {
		fmt.Fprintln(out, "[perf] WARNING: k6 not installed — skipping load tests.")
		return []StepResult{{Name: "k6", Warn: true}}
	}

	k6Dir := filepath.Join(root, "tests", "perf", "k6")
	entries, err := os.ReadDir(k6Dir)
	if err != nil {
		return []StepResult{{Name: "k6", Err: err}}
	}

	var results []StepResult
	for _, e := range entries {
		if e.Name() == "thresholds.js" || filepath.Ext(e.Name()) != ".js" {
			continue
		}
		name := e.Name()[:len(e.Name())-3]
		start := time.Now()
		step := ToolStep{
			Name: "k6:" + name,
			Bin:  "k6",
			Args: []string{"run", filepath.Join(k6Dir, e.Name())},
			Env:  []string{fmt.Sprintf("BACKEND_URL=http://localhost:%d", cfg.BackendPort)},
		}
		err := step.Run(ctx, out)
		results = append(results, StepResult{Name: "k6:" + name, Err: err, Duration: time.Since(start)})
	}
	return results
}

func runPerfLighthouse(ctx context.Context, cfg PerfConfig, root string, out io.Writer) StepResult {
	start := time.Now()
	frontendDir := filepath.Join(root, "app", "controlroom_frontend")
	nodeDir := ResolveNode()

	const warningFile = "/tmp/perf-lcp-warnings"
	os.Remove(warningFile)

	env := os.Environ()
	if nodeDir != "" {
		env = append(env, "PATH="+nodeDir+":"+os.Getenv("PATH"))
	}
	env = append(env, fmt.Sprintf("BASE_URL=http://localhost:%d", cfg.FrontendPort))

	step := ToolStep{
		Name: "lighthouse",
		Bin:  "npx",
		Args: []string{"playwright", "test", "--config", "playwright.perf.config.ts"},
		Dir:  frontendDir,
		Env:  env,
	}
	err := step.Run(ctx, out)

	var warn bool
	if err == nil {
		if info, statErr := os.Stat(warningFile); statErr == nil && info.Size() > 0 {
			warn = true
		}
	}
	return StepResult{Name: "lighthouse", Err: err, Warn: warn, Duration: time.Since(start)}
}

func runCarbonReport(carbonURL, root string, out io.Writer) {
	fmt.Fprintf(out, "[perf] Running CO₂ report against %s...\n", carbonURL)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()
	frontendDir := filepath.Join(root, "app", "controlroom_frontend")
	nodeDir := ResolveNode()
	cmd := exec.CommandContext(ctx, "npx", "playwright", "test",
		"--config", "playwright.perf.config.ts",
	)
	cmd.Dir = frontendDir
	cmd.Env = append(os.Environ(), "CARBON_BASE_URL="+carbonURL)
	if nodeDir != "" {
		cmd.Env = append(cmd.Env, "PATH="+nodeDir+":"+os.Getenv("PATH"))
	}
	lw := NewLabelWriter("carbon", out)
	cmd.Stdout = lw
	cmd.Stderr = lw
	cmd.Run()  //nolint — carbon report is advisory, never fails the suite
	lw.Flush() //nolint
}
