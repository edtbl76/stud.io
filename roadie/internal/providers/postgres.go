package providers

import (
	"context"
	"io"
	"log/slog"
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
	return err == nil, nil
}

func (p *PostgresProvider) ExecSQL(ctx context.Context, cfg DBConfig, sql string) error {
	args := []string{
		"compose", "-f", p.composeFile,
		"exec", "-T", cfg.Service,
		"psql", "-U", cfg.User, "-c", sql,
	}
	return p.run.Run(ctx, io.Discard, "docker", args...)
}
