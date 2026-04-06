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
	const root = "."
	if err := newManager(cfg).Build(ctx, cfg, flags.dev); err != nil {
		return err
	}
	if err := applySchema(ctx, cfg, out); err != nil {
		return err
	}
	return runTests(ctx, flags, root, out)
}

// runTests runs the unit pipeline then any enabled optional suites.
func runTests(ctx context.Context, flags buildFlags, root string, out io.Writer) error {
	if !flags.skipTests {
		if err := runUnitTests(ctx, root, out); err != nil {
			return err
		}
	}
	if err := runSelectedSuites(ctx, flags, root, out); err != nil {
		return err
	}
	fmt.Fprintln(out, "[roadie] Build complete.")
	return nil
}

// runUnitTests runs tsc → jest → pytest in fatal-sequential order.
func runUnitTests(ctx context.Context, root string, out io.Writer) error {
	fmt.Fprintln(out, "[roadie] Running unit tests...")
	return pipeline.New(
		pipeline.TscStep(root),
		pipeline.JestStep(root, false),
		pipeline.PytestStep(root),
	).RunSequential(ctx, out)
}

// runSelectedSuites runs E2E, scan, and perf suites based on the enabled flags.
func runSelectedSuites(ctx context.Context, flags buildFlags, root string, out io.Writer) error {
	suites := []struct {
		enabled bool
		label   string
		step    pipeline.ToolStep
	}{
		{flags.runE2E(), "E2E tests", pipeline.E2EStep(root)},
		{flags.runScan(), "security scans", pipeline.ScanStep(root)},
		{flags.runPerf(), "performance tests", pipeline.PerfStep(root)},
	}
	for _, s := range suites {
		if !s.enabled {
			continue
		}
		fmt.Fprintf(out, "[roadie] Running %s...\n", s.label)
		if err := pipeline.New(s.step).RunSequential(ctx, out); err != nil {
			return err
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
	db := providers.NewPostgresProvider(cfg.Providers.Container.ComposeFile, nil)
	for _, dbName := range cfg.Build.Databases {
		if err := applySchemaToDatabase(ctx, db, cfg, dbName, out); err != nil {
			return err
		}
	}
	return nil
}

// applySchemaToDatabase applies each schema file to a single database in order.
func applySchemaToDatabase(ctx context.Context, db providers.SQLDatabaseProvider, cfg *config.Config, dbName string, out io.Writer) error {
	dbCfg := providers.DBConfig{
		Service: cfg.Providers.Database.Service,
		User:    cfg.Providers.Database.User,
		DBName:  dbName,
	}
	for _, schemaFile := range cfg.Build.SchemaFiles {
		fmt.Fprintf(out, "[roadie] Applying %s → %s\n", schemaFile, dbName)
		if err := db.ExecSQLFile(ctx, dbCfg, schemaFile); err != nil {
			return fmt.Errorf("applying %s to %s: %w", schemaFile, dbName, err)
		}
	}
	return nil
}
