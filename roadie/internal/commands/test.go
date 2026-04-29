package commands

import (
	"errors"
	"fmt"
	"os"
	"os/signal"
	"sync"
	"syscall"

	"github.com/spf13/cobra"
	"github.com/studiocontrolroom/roadie/internal/config"
	"github.com/studiocontrolroom/roadie/internal/pipeline"
)

// AddTestCommands registers the test command and its subcommands on root.
func AddTestCommands(root *cobra.Command) {
	cmd := testCmd()
	cmd.AddCommand(unitCmd(), e2eCmd(), scanCmd(), perfCmd(), pbtCmd(), fullCmd())
	root.AddCommand(cmd)
}

func testCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "test",
		Short: "Run test suites",
		Long: `Run one or more test suites. Use a subcommand to select the suite.

  roadie test unit [tsc|jest|ruff|bandit|pytest|go-test|pip-audit|npm-audit]
  roadie test e2e
  roadie test scan [sonar|trivy|secrets|headers|govulncheck|gosec|staticcheck] [--gate] [--json]
  roadie test perf [bundle|benchmarks|k6|lighthouse] [--no-bundle] [--json]
  roadie test pbt [fast-check] [hypothesis] [--json]
  roadie test full`,
	}
}

func unitCmd() *cobra.Command {
	return &cobra.Command{
		Use:       "unit [tsc] [jest] [ruff] [bandit] [pytest] [go-test] [pip-audit] [npm-audit]",
		Short:     "Run unit tests (tsc, jest, ruff, bandit, pytest, go-test, pip-audit, npm-audit)",
		ValidArgs: []string{"tsc", "jest", "ruff", "bandit", "pytest", "go-test", "pip-audit", "npm-audit"},
		Args:      cobra.OnlyValidArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			r := pipeline.Root(".")
			fmt.Fprintln(os.Stdout, "[roadie] Running unit tests...")
			if len(args) > 0 {
				// Targeted run: sequential so the user sees one tool at a time.
				steps := buildUnitPipeline(r, args, true)
				if len(steps) == 0 {
					return fmt.Errorf("no steps matched selectors %v; valid: tsc, jest, ruff, bandit, pytest, go-test, pip-audit, npm-audit", args)
				}
				return pipeline.New(steps...).RunSequential(cmd.Context(), os.Stdout)
			}
			// Full suite: gate on npm-install, then fan out all tools in parallel.
			if err := pipeline.New(pipeline.NpmInstallStep(r)).RunSequential(cmd.Context(), os.Stdout); err != nil {
				return err
			}
			results, err := pipeline.New(buildUnitPipeline(r, nil, false)...).RunParallel(cmd.Context(), os.Stdout)
			pipeline.PrintSummary(os.Stdout, results)
			return err
		},
	}
}

func e2eCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "e2e",
		Short: "Run E2E tests (Playwright shards)",
		RunE: func(cmd *cobra.Command, _ []string) error {
			cfg, err := loadConfig()
			if err != nil {
				return err
			}
			if err := validateE2EConfig(cfg); err != nil {
				return err
			}
			// Wrap in a signal-aware context so Ctrl-C / SIGTERM cancel the
			// context, which causes RunE2E to exit and run its deferred cleanup
			// (removeBackendShards) rather than leaving containers orphaned.
			ctx, stop := signal.NotifyContext(cmd.Context(), os.Interrupt, syscall.SIGTERM)
			defer stop()
			fmt.Fprintln(os.Stdout, "[roadie] Running E2E tests...")
			return pipeline.RunE2E(ctx, e2eConfigFrom(cfg), pipeline.Root("."), os.Stdout)
		},
	}
}

func scanCmd() *cobra.Command {
	var gate bool
	var jsonOut bool
	cmd := &cobra.Command{
		Use:       "scan [sonar] [trivy] [secrets] [headers] [govulncheck] [gosec] [staticcheck]",
		Short:     "Run security scans (sonar, trivy, secrets, headers, govulncheck, gosec, staticcheck)",
		ValidArgs: []string{"sonar", "trivy", "secrets", "headers", "govulncheck", "gosec", "staticcheck"},
		Args:      cobra.OnlyValidArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			flags := buildScanFlags(args, gate)
			fmt.Fprintln(os.Stdout, "[roadie] Running security scans...")
			results, err := pipeline.RunScan(cmd.Context(), pipeline.Root("."), flags, os.Stdout)
			printSummary(os.Stdout, results, jsonOut)
			return err
		},
	}
	cmd.Flags().BoolVar(&gate, "gate", false, "verify SonarQube quality gate after scan")
	cmd.Flags().BoolVar(&jsonOut, "json", false, "emit summary as JSON")
	return cmd
}

func perfCmd() *cobra.Command {
	var noBundle bool
	var jsonOut bool
	cmd := &cobra.Command{
		Use:       "perf [bundle|benchmarks|k6|lighthouse]",
		Short:     "Run performance tests (benchmarks, k6, Lighthouse)",
		ValidArgs: []string{"bundle", "benchmarks", "k6", "lighthouse"},
		Args:      cobra.OnlyValidArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			if len(args) > 1 {
				return fmt.Errorf("only one of bundle|benchmarks|k6|lighthouse may be specified")
			}
			cfg, err := loadConfig()
			if err != nil {
				return err
			}
			if err := validatePerfConfig(cfg); err != nil {
				return err
			}
			flags := buildPerfFlags(args, noBundle)
			fmt.Fprintln(os.Stdout, "[roadie] Running performance tests...")
			results, err := pipeline.RunPerf(cmd.Context(), perfConfigFrom(cfg), flags, os.Stdout)
			printSummary(os.Stdout, results, jsonOut)
			return err
		},
	}
	cmd.Flags().BoolVar(&noBundle, "no-bundle", false, "skip Next.js production build (reuse existing .next-perf)")
	cmd.Flags().BoolVar(&jsonOut, "json", false, "emit summary as JSON")
	return cmd
}

func pbtCmd() *cobra.Command {
	var jsonOut bool
	cmd := &cobra.Command{
		Use:       "pbt [fast-check] [hypothesis]",
		Short:     "Run property-based tests (fast-check, hypothesis)",
		ValidArgs: []string{"fast-check", "hypothesis"},
		Args:      cobra.OnlyValidArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			cfg, err := loadConfig()
			if err != nil {
				return err
			}
			flags := buildPBTFlags(args)
			fmt.Fprintln(os.Stdout, "[roadie] Running property-based tests...")
			results, err := pipeline.RunPBT(cmd.Context(), pbtConfigFrom(pipeline.Root("."), cfg), flags, os.Stdout)
			printSummary(os.Stdout, results, jsonOut)
			return err
		},
	}
	cmd.Flags().BoolVar(&jsonOut, "json", false, "emit summary as JSON")
	return cmd
}

// buildPBTFlags maps positional args to PBTFlags. Empty args means run all.
func buildPBTFlags(args []string) pipeline.PBTFlags {
	if len(args) == 0 {
		return pipeline.AllPBTFlags()
	}
	var f pipeline.PBTFlags
	for _, a := range args {
		switch a {
		case "fast-check":
			f.FastCheck = true
		case "hypothesis":
			f.Hypothesis = true
		}
	}
	return f
}

// pbtConfigFrom builds a PBTConfig from the application config.
func pbtConfigFrom(root pipeline.Root, cfg *config.Config) pipeline.PBTConfig {
	return pipeline.PBTConfig{Root: root, Examples: cfg.Test.PBT.Examples}
}

func fullCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "full",
		Short: "Run all suites: unit → scan (with gate) → e2e → perf",
		RunE: func(cmd *cobra.Command, _ []string) error {
			ctx := cmd.Context()
			cfg, err := loadConfig()
			if err != nil {
				return err
			}
			r := pipeline.Root(".")

			if err := validateE2EConfig(cfg); err != nil {
				return err
			}
			if err := validatePerfConfig(cfg); err != nil {
				return err
			}

			// npm-install runs once before the parallel phase so that both the
			// unit Jest step and the PBT fast-check step share the same
			// node_modules without a race.
			fmt.Fprintln(os.Stdout, "[roadie] Installing frontend dependencies...")
			if err := pipeline.New(pipeline.NpmInstallStep(r)).RunSequential(ctx, os.Stdout); err != nil {
				return err
			}

			// Run unit and PBT suites in parallel — after npm-install they are
			// fully independent. Output lines are labeled ([jest], [hypothesis],
			// etc.) so interleaved output remains readable.
			fmt.Fprintln(os.Stdout, "[roadie] Running unit and property-based tests (parallel)...")
			var (
				wg         sync.WaitGroup
				unitErr    error
				pbtErr     error
				pbtResults []pipeline.StepResult
			)
			wg.Add(2)
			go func() {
				defer wg.Done()
				var results []pipeline.StepResult
				results, unitErr = pipeline.New(buildUnitPipeline(r, nil, false)...).RunParallel(ctx, os.Stdout)
				pipeline.PrintSummary(os.Stdout, results)
			}()
			go func() {
				defer wg.Done()
				pbtResults, pbtErr = pipeline.RunPBT(ctx, pbtConfigFrom(r, cfg), pipeline.AllPBTFlags(), os.Stdout)
			}()
			wg.Wait()

			pipeline.PrintSummary(os.Stdout, pbtResults)
			if err := errors.Join(unitErr, pbtErr); err != nil {
				return err
			}

			// Scans run before E2E so a failing quality gate blocks E2E,
			// matching build.sh --dev behaviour.
			fmt.Fprintln(os.Stdout, "[roadie] Running security scans...")
			scanResults, err := pipeline.RunScan(ctx, r, pipeline.AllScanFlags(true), os.Stdout)
			pipeline.PrintSummary(os.Stdout, scanResults)
			if err != nil {
				return err
			}

			fmt.Fprintln(os.Stdout, "[roadie] Running E2E tests...")
			e2eCtx, stopE2E := signal.NotifyContext(ctx, os.Interrupt, syscall.SIGTERM)
			e2eErr := pipeline.RunE2E(e2eCtx, e2eConfigFrom(cfg), r, os.Stdout)
			stopE2E()
			if e2eErr != nil {
				return e2eErr
			}

			fmt.Fprintln(os.Stdout, "[roadie] Running performance tests...")
			perfResults, err := pipeline.RunPerf(ctx, perfConfigFrom(cfg), pipeline.PerfFlags{}, os.Stdout)
			pipeline.PrintSummary(os.Stdout, perfResults)
			return err
		},
	}
}

// buildScanFlags maps positional args to ScanFlags. Empty args means all.
func buildScanFlags(args []string, gate bool) pipeline.ScanFlags {
	if len(args) == 0 {
		return pipeline.AllScanFlags(gate)
	}
	f := pipeline.ScanFlags{Gate: gate}
	fields := map[string]*bool{
		"sonar":       &f.Sonar,
		"trivy":       &f.Trivy,
		"secrets":     &f.Secrets, // pragma: allowlist secret
		"headers":     &f.Headers,
		"govulncheck": &f.Govulncheck,
		"gosec":       &f.Gosec,
		"staticcheck": &f.Staticcheck,
	}
	for _, a := range args {
		if p := fields[a]; p != nil {
			*p = true
		}
	}
	return f
}

// buildPerfFlags maps positional args to PerfFlags.
func buildPerfFlags(args []string, noBundle bool) pipeline.PerfFlags {
	f := pipeline.PerfFlags{NoBundle: noBundle}
	for _, a := range args {
		switch a {
		case "bundle":
			f.Bundle = true
		case "benchmarks":
			f.Benchmarks = true
		case "k6":
			f.K6 = true
		case "lighthouse":
			f.Lighthouse = true
		}
	}
	return f
}

// validateE2EConfig returns a clear error if cfg is missing fields required by
// the E2E runner. Call before e2eConfigFrom/RunE2E so runners never receive
// zero-valued configs.
func validateE2EConfig(cfg *config.Config) error {
	e := cfg.Test.E2E
	switch {
	case e.Shards <= 0:
		return fmt.Errorf("test.e2e.shards must be > 0 (got %d); add a test: e2e: section to roadie.yml", e.Shards)
	case e.BackendService == "":
		return fmt.Errorf("test.e2e.backend_service is required for E2E tests")
	case e.BackendBasePort <= 0:
		return fmt.Errorf("test.e2e.backend_base_port must be > 0 (got %d)", e.BackendBasePort)
	case e.FrontendBasePort <= 0:
		return fmt.Errorf("test.e2e.frontend_base_port must be > 0 (got %d)", e.FrontendBasePort)
	case cfg.Test.DB.Container == "":
		return fmt.Errorf("test.db.container is required for E2E tests")
	case cfg.Test.DB.Source == "":
		return fmt.Errorf("test.db.source is required for E2E tests")
	}
	return nil
}

// validatePerfConfig returns a clear error if cfg is missing fields required by
// the perf runner. Call before perfConfigFrom/RunPerf so runners never receive
// zero-valued configs.
func validatePerfConfig(cfg *config.Config) error {
	p := cfg.Test.Perf
	switch {
	case p.BackendPort <= 0:
		return fmt.Errorf("test.perf.backend_port must be > 0 (got %d); add a test: perf: section to roadie.yml", p.BackendPort)
	case p.FrontendPort <= 0:
		return fmt.Errorf("test.perf.frontend_port must be > 0 (got %d)", p.FrontendPort)
	case cfg.Test.E2E.BackendService == "":
		return fmt.Errorf("test.e2e.backend_service is required for perf tests")
	}
	return nil
}

// e2eConfigFrom builds an E2EConfig from the application config.
func e2eConfigFrom(cfg *config.Config) pipeline.E2EConfig {
	e := cfg.Test.E2E
	return pipeline.E2EConfig{
		Shards:                e.Shards,
		DevComposeFile:        cfg.Providers.Container.DevComposeFile,
		BackendComposeProject: e.BackendComposeProject,
		BackendService:        e.BackendService,
		BackendInternalPort:   e.BackendInternalPort,
		BackendBasePort:       e.BackendBasePort,
		FrontendBasePort:      e.FrontendBasePort,
		DBContainer:           cfg.Test.DB.Container,
		DBUser:                cfg.Test.DB.User,
		DBPassword:            cfg.Test.DB.Password, // pragma: allowlist secret
		DBSource:              cfg.Test.DB.Source,
		GearlistService:       e.GearlistService,
		GearlistPort:          e.GearlistPort,
		GearlistInternalPort:  e.GearlistInternalPort,
	}
}

// perfConfigFrom builds a PerfConfig from the application config.
func perfConfigFrom(cfg *config.Config) pipeline.PerfConfig {
	p := cfg.Test.Perf
	e := cfg.Test.E2E
	return pipeline.PerfConfig{
		BackendPort:           p.BackendPort,
		FrontendPort:          p.FrontendPort,
		CarbonURL:             p.CarbonURL,
		GearlistService:       p.GearlistService,
		GearlistPort:          p.GearlistPort,
		GearlistInternalPort:  p.GearlistInternalPort,
		BackendService:        e.BackendService,
		DBSource:              cfg.Test.DB.Source,
		DevComposeFile:        cfg.Providers.Container.DevComposeFile,
		BackendComposeProject: e.BackendComposeProject,
		BackendInternalPort:   e.BackendInternalPort,
		Root:                  ".",
	}
}

// printSummary writes the results table, using JSON format when requested.
func printSummary(out *os.File, results []pipeline.StepResult, jsonOut bool) {
	if jsonOut {
		pipeline.PrintSummaryJSON(out, results) //nolint
		return
	}
	pipeline.PrintSummary(out, results)
}
