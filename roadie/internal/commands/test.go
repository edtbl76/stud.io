package commands

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
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
  roadie test scan [sonar|trivy|secrets|headers] [--gate]
  roadie test perf [bundle|benchmarks|k6|lighthouse] [--no-bundle]
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
			fmt.Fprintln(os.Stdout, "[roadie] Running E2E tests...")
			return pipeline.New(pipeline.E2EStep(".")).RunSequential(cmd.Context(), os.Stdout)
		},
	}
}

func scanCmd() *cobra.Command {
	var gate bool
	cmd := &cobra.Command{
		Use:       "scan [sonar] [trivy] [secrets] [headers]",
		Short:     "Run security scans",
		ValidArgs: []string{"sonar", "trivy", "secrets", "headers"},
		Args:      cobra.OnlyValidArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			r := pipeline.Root(".")
			steps := scanSteps(r, args, gate)
			if len(args) > 0 && len(steps) == 0 {
				return fmt.Errorf("no steps matched selectors %v; valid: sonar, trivy, secrets, headers", args)
			}
			fmt.Fprintln(os.Stdout, "[roadie] Running security scans...")
			results, err := pipeline.New(steps...).RunCollect(cmd.Context(), os.Stdout)
			pipeline.PrintSummary(os.Stdout, results)
			return err
		},
	}
	cmd.Flags().BoolVar(&gate, "gate", false, "verify SonarQube quality gate after scan")
	return cmd
}

// perfFlagMap maps perf subtype positional args to test-perf.sh flags.
var perfFlagMap = map[string]string{
	"bundle":     "--bundle",
	"benchmarks": "--benchmarks",
	"k6":         "--k6",
	"lighthouse": "--lighthouse",
}

func perfCmd() *cobra.Command {
	var noBundle bool
	cmd := &cobra.Command{
		Use:       "perf [bundle|benchmarks|k6|lighthouse]",
		Short:     "Run performance tests (benchmarks, k6, Lighthouse)",
		ValidArgs: []string{"bundle", "benchmarks", "k6", "lighthouse"},
		Args:      cobra.OnlyValidArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			if len(args) > 1 {
				return fmt.Errorf("only one of bundle|benchmarks|k6|lighthouse may be specified")
			}
			r := pipeline.Root(".")
			scriptFlags := subtypesToFlags(args, perfFlagMap)
			if noBundle {
				scriptFlags = append(scriptFlags, "--no-bundle")
			}
			fmt.Fprintln(os.Stdout, "[roadie] Running performance tests...")
			results, err := pipeline.New(pipeline.PerfStep(r, scriptFlags...)).RunCollect(cmd.Context(), os.Stdout)
			pipeline.PrintSummary(os.Stdout, results)
			return err
		},
	}
	cmd.Flags().BoolVar(&noBundle, "no-bundle", false, "skip Next.js production build (reuse existing .next-perf)")
	return cmd
}

func fullCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "full",
		Short: "Run all suites: unit → e2e → scan (with gate) → perf",
		RunE: func(cmd *cobra.Command, _ []string) error {
			ctx := cmd.Context()
			r := pipeline.Root(".")

			fmt.Fprintln(os.Stdout, "[roadie] Running unit tests...")
			if err := pipeline.New(buildUnitPipeline(r, nil)...).RunSequential(ctx, os.Stdout); err != nil {
				return err
			}

			fmt.Fprintln(os.Stdout, "[roadie] Running E2E tests...")
			if err := pipeline.New(pipeline.E2EStep(r)).RunSequential(ctx, os.Stdout); err != nil {
				return err
			}

			fmt.Fprintln(os.Stdout, "[roadie] Running security scans...")
			scanResults, err := pipeline.New(scanSteps(r, nil, true)...).RunCollect(ctx, os.Stdout)
			pipeline.PrintSummary(os.Stdout, scanResults)
			if err != nil {
				return err
			}

			fmt.Fprintln(os.Stdout, "[roadie] Running performance tests...")
			perfResults, err := pipeline.New(pipeline.PerfStep(r)).RunCollect(ctx, os.Stdout)
			pipeline.PrintSummary(os.Stdout, perfResults)
			return err
		},
	}
}

// scanSteps returns ToolSteps for the requested scan checks. checks is the
// positional-arg list; if empty, all checks are included. gate applies only
// when sonar is selected and blocks until the quality gate result is known.
func scanSteps(root pipeline.Root, checks []string, gate bool) []pipeline.ToolStep {
	run := toolFilter(checks)
	var steps []pipeline.ToolStep
	if run("sonar") {
		steps = append(steps, pipeline.SonarScanStep(root, gate))
	}
	if run("trivy") {
		steps = append(steps, pipeline.TrivyBackendStep(root))
		steps = append(steps, pipeline.TrivyFrontendStep(root))
	}
	if run("secrets") {
		steps = append(steps, pipeline.DetectSecretsStep(root))
	}
	if run("headers") {
		steps = append(steps, pipeline.SecurityHeadersStep(root))
	}
	return steps
}

// subtypesToFlags maps positional subtype args to their script flag equivalents
// using flagMap. Args not found in flagMap are silently skipped.
func subtypesToFlags(args []string, flagMap map[string]string) []string {
	if len(args) == 0 {
		return nil
	}
	flags := make([]string, 0, len(args))
	for _, arg := range args {
		if f, ok := flagMap[arg]; ok {
			flags = append(flags, f)
		}
	}
	return flags
}
