package commands

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/spf13/cobra"
	"github.com/studiocontrolroom/roadie/internal/config"
	"github.com/studiocontrolroom/roadie/internal/providers"
)

// AddDBCommands registers the db subcommand group on the root command.
func AddDBCommands(root *cobra.Command) {
	db := &cobra.Command{
		Use:   "db",
		Short: "Database management operations",
	}
	db.AddCommand(dbInitCmd())
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
