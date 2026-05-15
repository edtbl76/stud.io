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
	var test bool
	cmd := &cobra.Command{
		Use:   "migrate",
		Short: "Apply unapplied migrations from sql/migrations/ to the database",
		Long: `Applies any SQL files in sql/migrations/ that have not yet been recorded in
the schema_migrations tracking table. Safe to run multiple times — already-applied
migrations are skipped. Files are applied in alphabetical order.

Without --test: targets the production database (providers.database.db_name).
With --test: targets each database in build.databases (the test databases).`,
		RunE: func(cmd *cobra.Command, _ []string) error {
			cfg, err := loadConfig()
			if err != nil {
				return err
			}
			db := providers.NewPostgresProvider(cfg.Providers.Container.ComposeFile, nil)
			if test {
				return migrateAllDatabases(cmd.Context(), cfg, db, os.Stdout, migrationsDir)
			}
			return runMigrate(cmd.Context(), cfg, db, os.Stdout)
		},
	}
	cmd.Flags().BoolVar(&test, "test", false, "migrate test databases (build.databases) instead of production")
	return cmd
}

type migrator struct {
	db    providers.SQLDatabaseProvider
	dbCfg providers.DBConfig
	out   io.Writer
}

func newMigrator(cfg *config.Config, db providers.SQLDatabaseProvider, out io.Writer) (*migrator, error) {
	if cfg.Providers.Database.DBName == "" {
		return nil, fmt.Errorf("providers.database.db_name is not set in roadie.yml")
	}
	return &migrator{
		db:  db,
		out: out,
		dbCfg: providers.DBConfig{
			Service: cfg.Providers.Database.Service,
			User:    cfg.Providers.Database.User,
			DBName:  cfg.Providers.Database.DBName,
		},
	}, nil
}

func runMigrate(ctx context.Context, cfg *config.Config, db providers.SQLDatabaseProvider, out io.Writer) error {
	m, err := newMigrator(cfg, db, out)
	if err != nil {
		return err
	}
	return m.apply(ctx, migrationsDir)
}

// migrateAllDatabases applies unapplied migrations to every database in
// cfg.Build.Databases. Exposed as a named function so tests can pass a
// custom dir without touching the hardcoded migrationsDir constant.
func migrateAllDatabases(ctx context.Context, cfg *config.Config, db providers.SQLDatabaseProvider, out io.Writer, dir string) error {
	if len(cfg.Build.Databases) == 0 {
		fmt.Fprintln(out, "[migrate] No test databases configured in build.databases.")
		return nil
	}
	if err := guardNoProdDB(cfg.Providers.Database.DBName, cfg.Build.Databases); err != nil {
		return err
	}
	for _, dbName := range cfg.Build.Databases {
		fmt.Fprintf(out, "[migrate] Migrating test database: %s\n", dbName)
		m, err := newMigratorForDB(cfg, dbName, db, out)
		if err != nil {
			return err
		}
		if err := m.apply(ctx, dir); err != nil {
			return fmt.Errorf("migrating %s: %w", dbName, err)
		}
	}
	return nil
}

func newMigratorForDB(cfg *config.Config, dbName string, db providers.SQLDatabaseProvider, out io.Writer) (*migrator, error) {
	if dbName == "" {
		return nil, fmt.Errorf("database name must not be empty")
	}
	return &migrator{
		db:  db,
		out: out,
		dbCfg: providers.DBConfig{
			Service: cfg.Providers.Database.Service,
			User:    cfg.Providers.Database.User,
			DBName:  dbName,
		},
	}, nil
}

func (m *migrator) apply(ctx context.Context, dir string) error {
	if err := m.db.ExecSQL(ctx, m.dbCfg, createMigrationsTableSQL); err != nil {
		return fmt.Errorf("creating schema_migrations table: %w", err)
	}
	applied, err := m.loadApplied(ctx)
	if err != nil {
		return err
	}
	count, err := m.applyEntries(ctx, dir, applied)
	if err != nil {
		return err
	}
	return m.printSummary(count)
}

func isMigrationFile(entry os.DirEntry) bool {
	return !entry.IsDir() && strings.HasSuffix(entry.Name(), ".sql")
}

func (m *migrator) applyEntries(ctx context.Context, dir string, applied map[string]bool) (int, error) {
	entries, err := os.ReadDir(dir)
	if os.IsNotExist(err) {
		return 0, nil
	}
	if err != nil {
		return 0, fmt.Errorf("reading %s: %w", dir, err)
	}
	if len(entries) == 0 {
		return 0, nil
	}
	count := 0
	for _, entry := range entries {
		if !isMigrationFile(entry) {
			continue
		}
		if applied[entry.Name()] {
			fmt.Fprintf(m.out, "[migrate] skip  %s (already applied)\n", entry.Name())
			continue
		}
		if err := m.applyOne(ctx, dir, entry.Name()); err != nil {
			return count, err
		}
		count++
	}
	return count, nil
}

func (m *migrator) loadApplied(ctx context.Context) (map[string]bool, error) {
	rows, err := m.db.QueryRows(ctx, m.dbCfg, "SELECT filename FROM schema_migrations ORDER BY filename")
	if err != nil {
		return nil, fmt.Errorf("querying applied migrations: %w", err)
	}
	set := make(map[string]bool, len(rows))
	for _, f := range rows {
		set[f] = true
	}
	return set, nil
}

func (m *migrator) applyOne(ctx context.Context, dir, name string) error {
	fmt.Fprintf(m.out, "[migrate] apply %s...\n", name)
	if err := m.db.ExecSQLFile(ctx, m.dbCfg, filepath.Join(dir, name)); err != nil {
		return fmt.Errorf("applying %s: %w", name, err)
	}
	record := fmt.Sprintf(
		"INSERT INTO schema_migrations (filename) VALUES ('%s') ON CONFLICT DO NOTHING",
		strings.ReplaceAll(name, "'", "''"),
	)
	if err := m.db.ExecSQL(ctx, m.dbCfg, record); err != nil {
		return fmt.Errorf("recording %s: %w", name, err)
	}
	return nil
}

func (m *migrator) printSummary(count int) error {
	if count == 0 {
		fmt.Fprintln(m.out, "[migrate] Nothing to apply — all migrations are current.")
	} else {
		fmt.Fprintf(m.out, "[migrate] Applied %d migration(s) to %s.\n", count, m.dbCfg.DBName)
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
