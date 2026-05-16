package providers

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"os"
	"strings"
)

// PostgresProvider implements SQLDatabaseProvider by running pg_isready and
// psql inside the database service container via docker compose exec.
type PostgresProvider struct {
	baseProvider
	composeFile string
	run         cmdRunner
}

// NewPostgresProvider creates a PostgresProvider for the given compose file.
func NewPostgresProvider(composeFile string, logger *slog.Logger) *PostgresProvider {
	return &PostgresProvider{
		baseProvider: newBase(logger),
		composeFile:  composeFile,
		run:          realRunner{},
	}
}

func (p *PostgresProvider) IsReady(ctx context.Context, cfg DBConfig) (bool, error) {
	args := []string{
		"compose", "-f", p.composeFile,
		"exec", "-T", cfg.Service,
		"pg_isready", "-U", cfg.User, "-q",
	}
	err := p.run.Run(ctx, io.Discard, "docker", args...)
	if err != nil {
		return false, err
	}
	return true, nil
}

func (p *PostgresProvider) ExecSQL(ctx context.Context, cfg DBConfig, sql string) error {
	args := []string{
		"compose", "-f", p.composeFile,
		"exec", "-T", cfg.Service,
		"psql", "-U", cfg.User,
	}
	if cfg.DBName != "" {
		args = append(args, "-d", cfg.DBName)
	}
	args = append(args, "-c", sql)
	return p.run.Run(ctx, io.Discard, "docker", args...)
}

// ExecSQLFile pipes the contents of path into psql via stdin (-f -) with
// --single-transaction so the entire file is applied atomically: if any
// statement fails, psql rolls back the whole file. This prevents partial
// schema application, but note that atomicity is per-file only — if multiple
// files are applied in sequence (see schemaApplier), schema files should be
// idempotent (e.g. use IF NOT EXISTS / CREATE OR REPLACE) so a retry after a
// cross-file failure is safe.
func (p *PostgresProvider) QueryRows(ctx context.Context, cfg DBConfig, query string) ([]string, error) {
	args := []string{
		"compose", "-f", p.composeFile,
		"exec", "-T", cfg.Service,
		"psql", "-U", cfg.User,
	}
	if cfg.DBName != "" {
		args = append(args, "-d", cfg.DBName)
	}
	args = append(args, "-t", "-A", "-c", query)
	out, err := p.run.Output(ctx, "docker", args...)
	if err != nil {
		return nil, err
	}
	return splitLines(string(out)), nil
}

func splitLines(s string) []string {
	var lines []string
	for _, line := range strings.Split(s, "\n") {
		if line = strings.TrimSpace(line); line != "" {
			lines = append(lines, line)
		}
	}
	return lines
}

func (p *PostgresProvider) ExecSQLFile(ctx context.Context, cfg DBConfig, path string) error {
	f, err := os.Open(path)
	if err != nil {
		return fmt.Errorf("opening SQL file %q: %w", path, err)
	}
	defer f.Close()

	args := []string{
		"compose", "-f", p.composeFile,
		"exec", "-T", cfg.Service,
		"psql", "-U", cfg.User,
	}
	if cfg.DBName != "" {
		args = append(args, "-d", cfg.DBName)
	}
	args = append(args, "--single-transaction", "--set", "ON_ERROR_STOP=on", "-f", "-")
	return p.run.RunWithStdin(ctx, IOStreams{Stdin: f, Out: io.Discard}, "docker", args...)
}
