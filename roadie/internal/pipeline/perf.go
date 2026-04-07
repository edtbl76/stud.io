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

// PerfConfig holds everything the perf runner needs.
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

// RunPerf orchestrates the full performance test suite: start backend →
// build frontend → start Next.js prod server → benchmarks → k6 → Lighthouse.
func RunPerf(ctx context.Context, cfg PerfConfig, root Root, flags PerfFlags, out io.Writer) ([]StepResult, error) {
	r := string(root)
	container := cfg.BackendService + "_perf"

	if err := startPerfBackend(ctx, cfg, r, container, out); err != nil {
		return nil, err
	}
	defer stopPerfBackend(container)

	if !flags.NoBundle {
		if err := buildFrontend(ctx, cfg, r, out); err != nil {
			return nil, err
		}
	} else if !hasPerfBuild(r) {
		return nil, fmt.Errorf("--no-bundle: .next-perf not found — run without --no-bundle first")
	}

	frontendProc, err := startFrontendProd(ctx, cfg, r, out)
	if err != nil {
		return nil, err
	}
	defer func() {
		frontendProc.Kill() //nolint
		if !flags.NoBundle {
			os.RemoveAll(filepath.Join(r, "app", "controlroom_frontend", ".next-perf"))
		}
	}()

	if err := waitForHTTP(ctx, fmt.Sprintf("http://localhost:%d", cfg.FrontendPort), 30, 2*time.Second); err != nil {
		return nil, fmt.Errorf("frontend health: %w", err)
	}

	return collectPerfResults(ctx, cfg, r, flags, out)
}

func startPerfBackend(ctx context.Context, cfg PerfConfig, root, container string, out io.Writer) error {
	fmt.Fprintf(out, "[perf] Starting backend on port %d (DB: %s)...\n", cfg.BackendPort, cfg.DBSource)
	exec.CommandContext(ctx, "docker", "rm", "-f", container).Run() //nolint
	cmd := exec.CommandContext(ctx, "docker", "compose",
		"-f", filepath.Join(root, cfg.DevComposeFile),
		"-p", cfg.BackendComposeProject,
		"run", "-d",
		"--name", container,
		"-p", fmt.Sprintf("%d:%d", cfg.BackendPort, cfg.BackendInternalPort),
		"-e", "DB_NAME="+cfg.DBSource,
		cfg.BackendService,
	)
	cmd.Stdout = out
	cmd.Stderr = out
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("starting perf backend: %w", err)
	}
	url := fmt.Sprintf("http://localhost:%d/health", cfg.BackendPort)
	return waitForHTTP(ctx, url, 30, 2*time.Second)
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
	logFile, _ := os.Create("/tmp/perf-frontend.log")
	cmd.Stdout = logFile
	cmd.Stderr = logFile

	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("starting perf frontend: %w", err)
	}
	return cmd.Process, nil
}

// collectPerfResults runs the selected perf suites and returns StepResults.
func collectPerfResults(ctx context.Context, cfg PerfConfig, root string, flags PerfFlags, out io.Writer) ([]StepResult, error) {
	run := func(name string) bool {
		return !flags.anySelected() || (name == "benchmarks" && flags.Benchmarks) ||
			(name == "k6" && flags.K6) || (name == "lighthouse" && flags.Lighthouse)
	}

	var results []StepResult

	if run("benchmarks") {
		results = append(results, runPerfBenchmarks(ctx, root, out))
	}
	if run("k6") {
		results = append(results, runPerfK6(ctx, cfg, root, out)...)
	}
	if run("lighthouse") {
		results = append(results, runPerfLighthouse(ctx, cfg, root, out))
	}

	if cfg.CarbonURL != "" {
		runCarbonReport(cfg.CarbonURL, root, out)
	}

	return results, collectErrors(results)
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

	step := ToolStep{
		Name: "lighthouse",
		Bin:  "npx",
		Args: []string{"playwright", "test", "--config", "playwright.perf.config.ts"},
		Dir:  frontendDir,
		Env: func() []string {
			env := []string{fmt.Sprintf("BASE_URL=http://localhost:%d", cfg.FrontendPort)}
			if nodeDir != "" {
				env = append(env, "PATH="+nodeDir+":"+os.Getenv("PATH"))
			}
			return env
		}(),
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
	cmd := exec.CommandContext(ctx, "bash",
		filepath.Join(root, "scripts", "carbon-report.sh"),
	)
	cmd.Env = append(os.Environ(), "CARBON_BASE_URL="+carbonURL)
	lw := NewLabelWriter("carbon", out)
	cmd.Stdout = lw
	cmd.Stderr = lw
	cmd.Run()  //nolint — carbon report is advisory, never fails the suite
	lw.Flush() //nolint
}
