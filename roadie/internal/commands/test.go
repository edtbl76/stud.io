package commands

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
	"github.com/studiocontrolroom/roadie/internal/config"
	"github.com/studiocontrolroom/roadie/internal/pipeline"
)

// AddTestCommands registers the test command and its subcommands on root.
func AddTestCommands(root *cobra.Command) {
	cmd := testCmd()
	cmd.AddCommand(unitCmd(), e2eCmd(), scanCmd(), perfCmd(), fullCmd())
	root.AddCommand(cmd)
}

func testCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "test",
		Short: "Run test suites",
		Long: `Run one or more test suites. Use a subcommand to select the suite.

  roadie test unit [tsc|jest|ruff|bandit|pytest]
  roadie test e2e
  roadie test scan [sonar|trivy|secrets|headers] [--gate] [--json]
  roadie test perf [bundle|benchmarks|k6|lighthouse] [--no-bundle] [--json]
  roadie test full`,
	}
}

func unitCmd() *cobra.Command {
	return &cobra.Command{
		Use:       "unit [tsc] [jest] [ruff] [bandit] [pytest]",
		Short:     "Run unit tests (tsc, jest, ruff, bandit, pytest)",
		ValidArgs: []string{"tsc", "jest", "ruff", "bandit", "pytest"},
		Args:      cobra.OnlyValidArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			r := pipeline.Root(".")
			steps := buildUnitPipeline(r, args)
			if len(args) > 0 && len(steps) == 0 {
				return fmt.Errorf("no steps matched selectors %v; valid: tsc, jest, ruff, bandit, pytest", args)
			}
			fmt.Fprintln(os.Stdout, "[roadie] Running unit tests...")
			return pipeline.New(steps...).RunSequential(cmd.Context(), os.Stdout)
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
			fmt.Fprintln(os.Stdout, "[roadie] Running E2E tests...")
			return pipeline.RunE2E(cmd.Context(), e2eConfigFrom(cfg), pipeline.Root("."), os.Stdout)
		},
	}
}

func scanCmd() *cobra.Command {
	var gate bool
	var jsonOut bool
	cmd := &cobra.Command{
		Use:       "scan [sonar] [trivy] [secrets] [headers]",
		Short:     "Run security scans",
		ValidArgs: []string{"sonar", "trivy", "secrets", "headers"},
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

func fullCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "full",
		Short: "Run all suites: unit → e2e → scan (with gate) → perf",
		RunE: func(cmd *cobra.Command, _ []string) error {
			ctx := cmd.Context()
			cfg, err := loadConfig()
			if err != nil {
				return err
			}
			r := pipeline.Root(".")

			fmt.Fprintln(os.Stdout, "[roadie] Running unit tests...")
			if err := pipeline.New(buildUnitPipeline(r, nil)...).RunSequential(ctx, os.Stdout); err != nil {
				return err
			}

			fmt.Fprintln(os.Stdout, "[roadie] Running E2E tests...")
			if err := pipeline.RunE2E(ctx, e2eConfigFrom(cfg), r, os.Stdout); err != nil {
				return err
			}

			fmt.Fprintln(os.Stdout, "[roadie] Running security scans...")
			scanResults, err := pipeline.RunScan(ctx, r, pipeline.AllScanFlags(true), os.Stdout)
			pipeline.PrintSummary(os.Stdout, scanResults)
			if err != nil {
				return err
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
	var f pipeline.ScanFlags
	f.Gate = gate
	for _, a := range args {
		switch a {
		case "sonar":
			f.Sonar = true
		case "trivy":
			f.Trivy = true
		case "secrets":
			f.Secrets = true // pragma: allowlist secret
		case "headers":
			f.Headers = true
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
