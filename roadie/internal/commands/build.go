package commands

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"

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
	dev        bool
	skipTests  bool
	schemaOnly bool
	forceBuild bool
	e2e        bool
	scan       bool
	perf       bool
	full       bool
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
	cmd.Flags().BoolVar(&flags.dev, "dev", false, "include dev tools (SonarQube, Woodpecker)")
	cmd.Flags().BoolVar(&flags.skipTests, "skip-tests", false, "skip unit tests")
	cmd.Flags().BoolVar(&flags.schemaOnly, "schema-only", false, "apply schema to test databases without rebuilding containers or running tests")
	cmd.Flags().BoolVar(&flags.forceBuild, "force-build", false, "force container rebuild even if Dockerfiles and dependencies are unchanged")
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
			return runBuild(cmd.Context(), cfg, buildFlags{dev: true, full: true, forceBuild: true}, os.Stdout)
		},
	}
}

// runBuild is the top-level coordinator: rebuild stack, apply schema + seeds,
// run tests. With --schema-only it skips container rebuilds and test execution,
// applying the schema AND seed files to the configured test databases. Used in
// CI to provision an isolated database namespace — schema plus reference-data
// seeds, so E2E reference tables are populated — without disturbing the running
// stack.
func runBuild(ctx context.Context, cfg *config.Config, flags buildFlags, out io.Writer) error {
	if err := buildStack(ctx, cfg, flags, out); err != nil {
		return err
	}
	if err := applySchema(ctx, cfg, out); err != nil {
		return err
	}
	if err := applySeeds(ctx, cfg, out); err != nil {
		return err
	}
	if flags.schemaOnly {
		return nil
	}
	return runTests(ctx, cfg, flags, out)
}

// buildStack rebuilds container images unless --schema-only is active.
// When rebuild_on is configured and --force-build is not set, it hashes those
// files and skips the expensive --build --force-recreate when nothing changed,
// falling back to a plain start instead. The hash is updated after a successful
// full build so subsequent unchanged runs also get the fast path.
func buildStack(ctx context.Context, cfg *config.Config, flags buildFlags, out io.Writer) error {
	if flags.schemaOnly {
		return nil
	}
	m := newManager(cfg)
	rebuildFiles := cfg.Build.RebuildOn
	if !flags.forceBuild && !containerRebuildNeeded(".", rebuildFiles, out) {
		return m.Start(ctx, cfg, flags.dev)
	}
	if err := m.Build(ctx, cfg, flags.dev); err != nil {
		return err
	}
	if len(rebuildFiles) > 0 {
		if err := updateContainerHash(".", rebuildFiles); err != nil {
			fmt.Fprintf(out, "[roadie] warning: could not update build hash: %v\n", err)
		}
	}
	return nil
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
	fmt.Fprintf(out, "  App:      %s\n", u.App)
	fmt.Fprintf(out, "  API:      %s\n", u.API)
	fmt.Fprintf(out, "  Docs:     %s\n", u.Docs)
	fmt.Fprintf(out, "  GearList: %s\n", u.GearList)
	fmt.Fprintf(out, "  MinIO:    %s\n", u.MinIO)
	if flags.dev {
		fmt.Fprintln(out, "")
		fmt.Fprintf(out, "  SonarQube:  %s\n", u.SonarQube)
		fmt.Fprintf(out, "  Woodpecker: %s\n", u.Woodpecker)
	}
	if flags.dev && flags.full {
		fmt.Fprintln(out, "")
		fmt.Fprintln(out, "  Release gate passed:")
		fmt.Fprintln(out, "    Pre-commit:  ruff · bandit · pip-audit · npm-audit · detect-secrets · tsc · jest · pytest")
		fmt.Fprintln(out, "    Unit:        tsc · jest · ruff · bandit · pytest · go-test · go-test-scanner")
		fmt.Fprintln(out, "    PBT:         fast-check · hypothesis · rapid")
		fmt.Fprintln(out, "    E2E:         Playwright")
		fmt.Fprintln(out, "    Scan:        SonarQube · Trivy · secrets · headers · govulncheck · gosec · staticcheck")
		fmt.Fprintln(out, "    Perf:        benchmarks · k6 · Lighthouse")
	}
	fmt.Fprintln(out, "============================================================")
}

// runUnitTests gates on npm-install then fans out all tool steps in parallel.
func runUnitTests(ctx context.Context, root string, out io.Writer) error {
	fmt.Fprintln(out, "[roadie] Running unit tests...")
	r := pipeline.Root(root)
	if err := pipeline.New(pipeline.NpmInstallStep(r)).RunSequential(ctx, out); err != nil {
		return err
	}
	results, err := pipeline.New(buildUnitPipeline(r, nil, false)...).RunParallel(ctx, out)
	pipeline.PrintSummary(out, results)
	return err
}

// npmTools is the set of tools that require npm install as a prerequisite.
var npmTools = map[string]bool{"tsc": true, "jest": true, "npm-audit": true}

// buildUnitPipeline returns unit test steps filtered by tools. If tools is
// empty, the default suite runs: tsc · jest · ruff · bandit · pytest · go-test · go-test-scanner.
// pip-audit and npm-audit are excluded from the default run and only included
// when explicitly named (they make network calls and run as separate pre-commit
// hooks). govulncheck also makes a network call and belongs to the Scan suite
// (roadie test scan govulncheck), not the Unit pipeline.
// NpmInstallStep is prepended whenever tsc, jest, or npm-audit is selected,
// unless withInstall is false (used by roadie test full, which runs npm-install
// once before launching unit and PBT goroutines concurrently).
// PytestStep receives --benchmark-skip to keep benchmarks in the perf suite.
// Jest receives --testPathIgnorePatterns to exclude PBT tests, which are run
// separately by roadie test pbt.
func buildUnitPipeline(root pipeline.Root, tools []string, withInstall bool) []pipeline.ToolStep {
	run := toolFilter(tools)
	explicit := len(tools) > 0
	var steps []pipeline.ToolStep
	if withInstall && needsNpmInstall(run) {
		steps = append(steps, pipeline.NpmInstallStep(root))
	}
	return append(steps, filteredSteps(root, run, explicit)...)
}

// needsNpmInstall reports whether any selected tool requires npm install.
func needsNpmInstall(run func(string) bool) bool {
	for tool := range npmTools {
		if run(tool) {
			return true
		}
	}
	return false
}

// filteredSteps returns the ordered tool steps matched by run. Steps marked
// explicitOnly are skipped when explicit is false (i.e. the default all-tools run).
func filteredSteps(root pipeline.Root, run func(string) bool, explicit bool) []pipeline.ToolStep {
	type entry struct {
		name         string
		explicitOnly bool
		step         func() pipeline.ToolStep
	}
	candidates := []entry{
		{"tsc", false, func() pipeline.ToolStep { return pipeline.TscStep(root) }},
		{"jest", false, func() pipeline.ToolStep {
			// Exclude PBT tests from the unit Jest run; they are run separately
			// by roadie test pbt with FC_NUM_RUNS set correctly.
			// Each --testPathIgnorePatterns flag is a separate CLI arg — Jest
			// (via yargs) collects them into an array. They replace the config
			// value, so all existing ignores are included here.
			return pipeline.JestStep(root, false,
				"--testPathIgnorePatterns=/__tests__/pbt/",
				"--testPathIgnorePatterns=/node_modules/",
				"--testPathIgnorePatterns=/.next/",
				"--testPathIgnorePatterns=/e2e/",
			)
		}},
		{"ruff", false, func() pipeline.ToolStep { return pipeline.RuffStep(root) }},
		{"bandit", false, func() pipeline.ToolStep { return pipeline.BanditStep(root) }},
		{"pytest", false, func() pipeline.ToolStep {
			// Exclude PBT tests from the unit pytest run; they are run separately
			// by roadie test pbt with HYPOTHESIS_MAX_EXAMPLES set correctly.
			pbtDir := filepath.Join(string(root), "app", "controlroom_backend", "tests", "pbt")
			return pipeline.PytestStep(root, "--benchmark-skip", "--ignore="+pbtDir)
		}},
		{"go-test", false, func() pipeline.ToolStep { return pipeline.GoTestStep(root) }},
		{"go-test-scanner", false, func() pipeline.ToolStep { return pipeline.GoTestPluginScannerStep(root) }},
		{"pip-audit", true, func() pipeline.ToolStep { return pipeline.PipAuditStep(root) }},
		{"npm-audit", true, func() pipeline.ToolStep { return pipeline.NpmAuditStep(root) }},
	}
	var steps []pipeline.ToolStep
	for _, c := range candidates {
		if c.explicitOnly && !explicit {
			continue
		}
		if run(c.name) {
			steps = append(steps, c.step())
		}
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

// runSuite validates then logs label and invokes run. It exists to give
// runSelectedSuites a single call-site per suite rather than repeating the
// validate → announce → run pattern inline.
func runSuite(out io.Writer, label string, validate, run func() error) error {
	if err := validate(); err != nil {
		return err
	}
	fmt.Fprintln(out, label)
	return run()
}

// runSelectedSuites runs scan → E2E → perf, matching build.sh order so that
// a failing quality gate blocks E2E the same way --dev does in the shell script.
func runSelectedSuites(ctx context.Context, cfg *config.Config, flags buildFlags, out io.Writer) error {
	r := pipeline.Root(".")
	if err := maybeRunScan(ctx, flags, r, out); err != nil {
		return err
	}
	if flags.runE2E() {
		if err := runSuite(out, "[roadie] Running E2E tests...",
			func() error { return validateE2EConfig(cfg) },
			func() error { return pipeline.RunE2E(ctx, e2eConfigFrom(cfg), r, out) },
		); err != nil {
			return err
		}
	}
	if flags.runPerf() {
		return runSuite(out, "[roadie] Running performance tests...",
			func() error { return validatePerfConfig(cfg) },
			func() error {
				results, err := pipeline.RunPerf(ctx, perfConfigFrom(cfg), pipeline.PerfFlags{}, out)
				pipeline.PrintSummary(out, results)
				return err
			},
		)
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

// applySchema applies each configured schema file to each configured test database.
func applySchema(ctx context.Context, cfg *config.Config, out io.Writer) error {
	return applySQLFiles(ctx, cfg, cfg.Build.SchemaFiles, out)
}

// applySeeds applies each configured seed file to each configured test database,
// after the schema. Seed files must be idempotent (e.g. ON CONFLICT DO UPDATE).
func applySeeds(ctx context.Context, cfg *config.Config, out io.Writer) error {
	return applySQLFiles(ctx, cfg, cfg.Build.SeedFiles, out)
}

// applySQLFiles applies an ordered list of SQL files to every configured test
// database. The production database must never appear in cfg.Build.Databases.
func applySQLFiles(ctx context.Context, cfg *config.Config, files []string, out io.Writer) error {
	if len(files) == 0 || len(cfg.Build.Databases) == 0 {
		return nil
	}
	if err := guardNoProdDB(cfg.Providers.Database.DBName, cfg.Build.Databases); err != nil {
		return err
	}
	applier := schemaApplier{
		db:          providers.NewPostgresProvider(cfg.Providers.Container.ComposeFile, nil),
		schemaFiles: files,
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
