package commands

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/spf13/cobra"
	"github.com/studiocontrolroom/roadie/internal/config"
	"github.com/studiocontrolroom/roadie/internal/providers"
)

const migrationsDir = "sql/migrations"

const createMigrationsTableSQL = `CREATE TABLE IF NOT EXISTS schema_migrations (
    filename   TEXT        PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`

// AddDBCommands registers the db subcommand group on the root command.
func AddDBCommands(root *cobra.Command) {
	db := &cobra.Command{
		Use:   "db",
		Short: "Database management operations",
	}
	db.AddCommand(dbInitCmd())
	db.AddCommand(dbMigrateCmd())
	root.AddCommand(db)
}

func dbInitCmd() *cobra.Command {
	var yes bool
	cmd := &cobra.Command{
		Use:   "init",
		Short: "Apply schema and views to the production database (first-time setup only)",
		Long: `Applies the configured schema files to the production database.

This command is for FIRST-TIME SETUP ONLY. It will fail if the tables already
exist. Existing data will not be dropped, but running this against a live
database is not reversible.

Use 'roadie build' to apply schema to test databases during development.`,
		RunE: func(cmd *cobra.Command, _ []string) error {
			if !yes && !confirmDBInit(os.Stdin, os.Stderr) {
				return nil
			}
			cfg, err := loadConfig()
			if err != nil {
				return err
			}
			return initProductionDB(cmd.Context(), cfg)
		},
	}
	cmd.Flags().BoolVar(&yes, "yes", false, "skip confirmation prompt (for scripted use)")
	return cmd
}

// initProductionDB validates config and applies schema files to the production database.
func initProductionDB(ctx context.Context, cfg *config.Config) error {
	if err := validateDBInitConfig(cfg); err != nil {
		return err
	}
	db := providers.NewPostgresProvider(cfg.Providers.Container.ComposeFile, nil)
	dbCfg := providers.DBConfig{
		Service: cfg.Providers.Database.Service,
		User:    cfg.Providers.Database.User,
		DBName:  cfg.Providers.Database.DBName,
	}
	for _, schemaFile := range cfg.Build.SchemaFiles {
		fmt.Fprintf(os.Stdout, "[roadie] Applying %s → %s...\n", schemaFile, dbCfg.DBName)
		if err := db.ExecSQLFile(ctx, dbCfg, schemaFile); err != nil {
			return fmt.Errorf("applying %s: %w", schemaFile, err)
		}
	}
	fmt.Fprintln(os.Stdout, "[roadie] Production database initialized.")
	return nil
}

// validateDBInitConfig checks that the config has the required fields for db init.
func validateDBInitConfig(cfg *config.Config) error {
	if cfg.Providers.Database.DBName == "" {
		return fmt.Errorf("providers.database.db_name is not set in roadie.yml")
	}
	if len(cfg.Build.SchemaFiles) == 0 {
		return fmt.Errorf("build.schema_files is empty in roadie.yml")
	}
	return nil
}

func dbMigrateCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "migrate",
		Short: "Apply unapplied migrations from sql/migrations/ to the production database",
		Long: `Applies any SQL files in sql/migrations/ that have not yet been recorded in
the schema_migrations tracking table. Safe to run multiple times — already-applied
migrations are skipped. Files are applied in alphabetical order.`,
		RunE: func(cmd *cobra.Command, _ []string) error {
			cfg, err := loadConfig()
			if err != nil {
				return err
			}
			return runMigrate(cmd.Context(), cfg, providers.NewPostgresProvider(cfg.Providers.Container.ComposeFile, nil), os.Stdout)
		},
	}
}

func runMigrate(ctx context.Context, cfg *config.Config, db providers.SQLDatabaseProvider, out io.Writer) error {
	return runMigrateFromDir(ctx, cfg, db, out, migrationsDir)
}

func runMigrateFromDir(ctx context.Context, cfg *config.Config, db providers.SQLDatabaseProvider, out io.Writer, dir string) error {
	if cfg.Providers.Database.DBName == "" {
		return fmt.Errorf("providers.database.db_name is not set in roadie.yml")
	}
	dbCfg := providers.DBConfig{
		Service: cfg.Providers.Database.Service,
		User:    cfg.Providers.Database.User,
		DBName:  cfg.Providers.Database.DBName,
	}

	if err := db.ExecSQL(ctx, dbCfg, createMigrationsTableSQL); err != nil {
		return fmt.Errorf("creating schema_migrations table: %w", err)
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		return fmt.Errorf("reading %s: %w", dir, err)
	}

	applied, err := db.QueryRows(ctx, dbCfg, "SELECT filename FROM schema_migrations ORDER BY filename")
	if err != nil {
		return fmt.Errorf("querying applied migrations: %w", err)
	}
	appliedSet := make(map[string]bool, len(applied))
	for _, f := range applied {
		appliedSet[f] = true
	}

	count := 0
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".sql") {
			continue
		}
		name := entry.Name()
		if appliedSet[name] {
			fmt.Fprintf(out, "[migrate] skip  %s (already applied)\n", name)
			continue
		}
		fmt.Fprintf(out, "[migrate] apply %s...\n", name)
		if err := db.ExecSQLFile(ctx, dbCfg, filepath.Join(dir, name)); err != nil {
			return fmt.Errorf("applying %s: %w", name, err)
		}
		record := fmt.Sprintf(
			"INSERT INTO schema_migrations (filename) VALUES ('%s') ON CONFLICT DO NOTHING",
			strings.ReplaceAll(name, "'", "''"),
		)
		if err := db.ExecSQL(ctx, dbCfg, record); err != nil {
			return fmt.Errorf("recording %s: %w", name, err)
		}
		count++
	}

	if count == 0 {
		fmt.Fprintln(out, "[migrate] Nothing to apply — all migrations are current.")
	} else {
		fmt.Fprintf(out, "[migrate] Applied %d migration(s) to %s.\n", count, dbCfg.DBName)
	}
	return nil
}

// confirmDBInit prints the warning gate and reads a line from r.
// Returns true only when the user types exactly "yes"; false on any other input.
func confirmDBInit(r io.Reader, w io.Writer) bool {
	fmt.Fprintln(w, "[roadie] ┌──────────────────────────────────────────────────────────┐")
	fmt.Fprintln(w, "[roadie] │  WARNING: roadie db init                                 │")
	fmt.Fprintln(w, "[roadie] │                                                          │")
	fmt.Fprintln(w, "[roadie] │  This applies schema files to the PRODUCTION database.  │")
	fmt.Fprintln(w, "[roadie] │  Intended for first-time setup only. Existing tables    │")
	fmt.Fprintln(w, "[roadie] │  will cause an error. This action is not reversible.    │")
	fmt.Fprintln(w, "[roadie] └──────────────────────────────────────────────────────────┘")
	fmt.Fprint(w, "[roadie] Type \"yes\" to continue: ")

	scanner := bufio.NewScanner(r)
	var answer string
	if scanner.Scan() {
		answer = strings.TrimSpace(scanner.Text())
	}
	if answer != "yes" {
		fmt.Fprintln(w, "[roadie] Aborted.")
		return false
	}
	return true
}
