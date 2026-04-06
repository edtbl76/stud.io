package providers

import "context"

// DBConfig identifies a database instance for health and admin operations.
type DBConfig struct {
	Service string
	User    string
	DBName  string
}

// SQLDatabaseProvider abstracts relational database operations needed by the CLI.
// PostgresProvider is the production implementation.
type SQLDatabaseProvider interface {
	IsReady(ctx context.Context, cfg DBConfig) (bool, error)
	ExecSQL(ctx context.Context, cfg DBConfig, sql string) error
	// ExecSQLFile pipes the contents of a SQL file into psql via stdin.
	// Use this for schema and view files — psql -f handles multi-statement
	// files correctly, unlike -c which is limited to single statements.
	ExecSQLFile(ctx context.Context, cfg DBConfig, path string) error
}
