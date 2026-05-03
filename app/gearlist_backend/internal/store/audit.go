package store

import (
	"context"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
)

// querier is satisfied by *pgxpool.Pool and pgx.Tx, allowing WriteAudit to
// be called both inside and outside a transaction.
type querier interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
}

// AuditEntry holds the data written to audit_log on any create, update, or delete.
type AuditEntry struct {
	TableName   string
	RecordID    pgtype.UUID
	Operation   string // "CREATE", "UPDATE", or "DELETE"
	OldData     []byte // JSON-encoded previous row, nil for CREATE
	NewData     []byte // JSON-encoded new row, nil for DELETE
	PerformedBy string
}

const auditInsertSQL = `
INSERT INTO audit_log (table_name, record_id, operation, old_data, new_data, performed_by)
VALUES ($1, $2, $3, $4, $5, $6)`

// WriteAudit inserts an entry into audit_log. Must be called within the same
// transaction as the DML it is auditing so both commit or roll back together.
func WriteAudit(ctx context.Context, db querier, e AuditEntry) error {
	_, err := db.Exec(ctx, auditInsertSQL,
		e.TableName, e.RecordID, e.Operation, e.OldData, e.NewData, e.PerformedBy,
	)
	return err
}
