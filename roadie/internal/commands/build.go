package commands

import (
	"context"
	"fmt"
	"io"
	"os"

	"github.com/spf13/cobra"
	"github.com/studiocontrolroom/roadie/internal/config"
	"github.com/studiocontrolroom/roadie/internal/pipeline"
	"github.com/studiocontrolroom/roadie/internal/providers"
)

// AddBuildCommands registers the build and release commands on the root command.
func AddBuildCommands(root *cobra.Command) {
	root.AddCommand(buildCmd(), releaseCmd())
}

type buildFlags struct {
	dev       bool
	skipTests bool
	e2e       bool
	scan      bool
	perf      bool
	full      bool
}

func (f buildFlags) runE2E() bool  { return f.e2e || f.full }
func (f buildFlags) runScan() bool { return f.scan || f.full }
func (f buildFlags) runPerf() bool { return f.perf || f.full }

func buildCmd() *cobra.Command {
	var flags buildFlags
	cmd := &cobra.Command{
		Use:   "build",
		Short: "Rebuild the stack and run tests",
		Long: `Rebuilds all container images (--build --force-recreate), applies schema to
test databases, then runs the requested test suites.

The production database is never touched — use 'roadie db init' for
first-time production setup.`,
		RunE: func(cmd *cobra.Command, _ []string) error {
			cfg, err := loadConfig()
			if err != nil {
				return err
			}
			return runBuild(cmd.Context(), cfg, flags, os.Stdout)
		},
	}
	cmd.Flags().BoolVar(&flags.dev, "dev", false, "include dev tools (SonarQube, Structurizr)")
	cmd.Flags().BoolVar(&flags.skipTests, "skip-tests", false, "skip unit tests")
	cmd.Flags().BoolVar(&flags.e2e, "e2e", false, "run E2E tests after build")
	cmd.Flags().BoolVar(&flags.scan, "scan", false, "run security scans after build")
	cmd.Flags().BoolVar(&flags.perf, "perf", false, "run performance tests after build")
	cmd.Flags().BoolVar(&flags.full, "full", false, "shortcut for --e2e --scan --perf")
	return cmd
}

func releaseCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "release",
		Short: "Full release gate: rebuild dev stack and run all test suites",
		Long: `Equivalent to 'roadie build --dev --full'. Rebuilds all images, brings up
the dev stack, applies schema to test databases, and runs unit, E2E, scan,
and perf suites. No skipping allowed.`,
		RunE: func(cmd *cobra.Command, _ []string) error {
			cfg, err := loadConfig()
			if err != nil {
				return err
			}
			return runBuild(cmd.Context(), cfg, buildFlags{dev: true, full: true}, os.Stdout)
		},
	}
}

// runBuild is the top-level coordinator: rebuild stack, apply schema, run tests.
func runBuild(ctx context.Context, cfg *config.Config, flags buildFlags, out io.Writer) error {
	if err := newManager(cfg).Build(ctx, cfg, flags.dev); err != nil {
		return err
	}
	if err := applySchema(ctx, cfg, out); err != nil {
		return err
	}
	return runTests(ctx, cfg, flags, out)
}

// runTests runs the unit pipeline then any enabled optional suites.
func runTests(ctx context.Context, cfg *config.Config, flags buildFlags, out io.Writer) error {
	if !flags.skipTests {
		if err := runUnitTests(ctx, ".", out); err != nil {
			return err
		}
	}
	if err := runSelectedSuites(ctx, cfg, flags, out); err != nil {
		return err
	}
	printBuildSummary(cfg, flags, out)
	return nil
}

// printBuildSummary prints the end-of-build summary matching build.sh output.
func printBuildSummary(cfg *config.Config, flags buildFlags, out io.Writer) {
	u := cfg.Stack.URLs
	fmt.Fprintln(out, "")
	fmt.Fprintln(out, "============================================================")
	fmt.Fprintln(out, "  All systems go.")
	fmt.Fprintln(out, "")
	fmt.Fprintf(out, "  App:  %s\n", u.App)
	fmt.Fprintf(out, "  API:  %s\n", u.API)
	fmt.Fprintf(out, "  Docs: %s\n", u.Docs)
	if flags.dev {
		fmt.Fprintln(out, "")
		fmt.Fprintf(out, "  SonarQube:    %s\n", u.SonarQube)
		fmt.Fprintf(out, "  Structurizr:  %s\n", u.Structurizr)
	}
	if flags.dev && flags.full {
		fmt.Fprintln(out, "")
		fmt.Fprintln(out, "  Release gate passed:")
		fmt.Fprintln(out, "    Pre-commit:  ruff · bandit · pip-audit · npm-audit · detect-secrets · tsc · jest · pytest")
		fmt.Fprintln(out, "    Unit:        tsc · jest · pytest")
		fmt.Fprintln(out, "    E2E:         Playwright")
		fmt.Fprintln(out, "    Scans:       SonarQube · Trivy · secrets · headers")
		fmt.Fprintln(out, "    Perf:        benchmarks · k6 · Lighthouse")
	}
	fmt.Fprintln(out, "============================================================")
}

// runUnitTests runs the full unit suite in fatal-sequential order.
func runUnitTests(ctx context.Context, root string, out io.Writer) error {
	fmt.Fprintln(out, "[roadie] Running unit tests...")
	r := pipeline.Root(root)
	return pipeline.New(buildUnitPipeline(r, nil)...).RunSequential(ctx, out)
}

// buildUnitPipeline returns unit test steps filtered by tools. If tools is
// empty, all steps are included: npm-install → tsc → jest → pytest.
// NpmInstallStep is prepended whenever tsc or jest is selected.
// PytestStep receives --benchmark-skip to keep benchmarks in the perf suite.
func buildUnitPipeline(root pipeline.Root, tools []string) []pipeline.ToolStep {
	run := toolFilter(tools)
	var steps []pipeline.ToolStep
	if run("tsc") || run("jest") {
		steps = append(steps, pipeline.NpmInstallStep(root))
	}
	if run("tsc") {
		steps = append(steps, pipeline.TscStep(root))
	}
	if run("jest") {
		steps = append(steps, pipeline.JestStep(root, false))
	}
	if run("ruff") {
		steps = append(steps, pipeline.RuffStep(root))
	}
	if run("bandit") {
		steps = append(steps, pipeline.BanditStep(root))
	}
	if run("pytest") {
		steps = append(steps, pipeline.PytestStep(root, "--benchmark-skip"))
	}
	return steps
}

// toolFilter returns a predicate that reports whether name is in allowed.
// An empty allowed list means all names are accepted.
func toolFilter(allowed []string) func(string) bool {
	if len(allowed) == 0 {
		return func(string) bool { return true }
	}
	return func(name string) bool {
		for _, a := range allowed {
			if a == name {
				return true
			}
		}
		return false
	}
}

// runSelectedSuites runs scan → E2E → perf, matching build.sh order so that
// a failing quality gate blocks E2E the same way --dev does in the shell script.
func runSelectedSuites(ctx context.Context, cfg *config.Config, flags buildFlags, out io.Writer) error {
	r := pipeline.Root(".")
	if err := maybeRunScan(ctx, flags, r, out); err != nil {
		return err
	}
	if flags.runE2E() {
		if err := validateE2EConfig(cfg); err != nil {
			return err
		}
		fmt.Fprintln(out, "[roadie] Running E2E tests...")
		if err := pipeline.RunE2E(ctx, e2eConfigFrom(cfg), r, out); err != nil {
			return err
		}
	}
	if flags.runPerf() {
		if err := validatePerfConfig(cfg); err != nil {
			return err
		}
		fmt.Fprintln(out, "[roadie] Running performance tests...")
		results, err := pipeline.RunPerf(ctx, perfConfigFrom(cfg), pipeline.PerfFlags{}, out)
		pipeline.PrintSummary(out, results)
		return err
	}
	return nil
}

func maybeRunScan(ctx context.Context, flags buildFlags, r pipeline.Root, out io.Writer) error {
	if !flags.runScan() {
		return nil
	}
	fmt.Fprintln(out, "[roadie] Running security scans...")
	results, err := pipeline.RunScan(ctx, r, pipeline.AllScanFlags(flags.dev), out)
	pipeline.PrintSummary(out, results)
	return err
}

// schemaApplier holds the stable configuration for applying schema files to
// one or more test databases.
type schemaApplier struct {
	db          providers.SQLDatabaseProvider
	schemaFiles []string
	service     string
	user        string
}

func (a schemaApplier) applyToDatabase(ctx context.Context, dbName string, out io.Writer) error {
	dbCfg := providers.DBConfig{
		Service: a.service,
		User:    a.user,
		DBName:  dbName,
	}
	for _, schemaFile := range a.schemaFiles {
		fmt.Fprintf(out, "[roadie] Applying %s → %s\n", schemaFile, dbName)
		if err := a.db.ExecSQLFile(ctx, dbCfg, schemaFile); err != nil {
			return fmt.Errorf("applying %s to %s: %w", schemaFile, dbName, err)
		}
	}
	return nil
}

// guardNoProdDB returns an error if the production database name appears in the
// test database list. prodDB is skipped when empty (db_name not configured).
func guardNoProdDB(prodDB string, databases []string) error {
	if prodDB == "" {
		return nil
	}
	for _, db := range databases {
		if db == prodDB {
			return fmt.Errorf("build: refusing to apply schema to production database %q; use 'roadie db init'", prodDB)
		}
	}
	return nil
}

// applySchema applies each configured schema file to each configured test
// database. The production database must never appear in cfg.Build.Databases.
func applySchema(ctx context.Context, cfg *config.Config, out io.Writer) error {
	if len(cfg.Build.SchemaFiles) == 0 || len(cfg.Build.Databases) == 0 {
		return nil
	}
	if err := guardNoProdDB(cfg.Providers.Database.DBName, cfg.Build.Databases); err != nil {
		return err
	}
	applier := schemaApplier{
		db:          providers.NewPostgresProvider(cfg.Providers.Container.ComposeFile, nil),
		schemaFiles: cfg.Build.SchemaFiles,
		service:     cfg.Providers.Database.Service,
		user:        cfg.Providers.Database.User,
	}
	for _, dbName := range cfg.Build.Databases {
		if err := applier.applyToDatabase(ctx, dbName, out); err != nil {
			return err
		}
	}
	return nil
}
