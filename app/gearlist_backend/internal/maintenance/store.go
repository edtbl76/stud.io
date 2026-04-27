package maintenance

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
)

// LogEntry is a row from gear_maintenance_log.
type LogEntry struct {
	LogID     pgtype.UUID        `db:"log_id"`
	GearID    pgtype.UUID        `db:"gear_id"`
	EventType string             `db:"event_type"`
	Notes     pgtype.Text        `db:"notes"`
	EventDate pgtype.Date        `db:"event_date"`
	CreatedAt pgtype.Timestamptz `db:"created_at"`
}

// CreateInput holds the fields for a new maintenance log entry.
type CreateInput struct {
	EventType string
	Notes     string
	EventDate time.Time
}

// querier is satisfied by *pgxpool.Pool and pgx.Tx.
type querier interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
}

// Store provides data access for gear_maintenance_log.
type Store struct{ db querier }

// NewStore returns a Store backed by db.
func NewStore(db querier) *Store { return &Store{db: db} }

const listSQL = `
SELECT log_id, gear_id, event_type, notes, event_date, created_at
FROM   gear_maintenance_log
WHERE  gear_id = $1
ORDER  BY event_date DESC, created_at DESC`

// List returns all maintenance log entries for a gear item, newest first.
func (s *Store) List(ctx context.Context, gearID pgtype.UUID) ([]LogEntry, error) {
	rows, err := s.db.Query(ctx, listSQL, gearID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return pgx.CollectRows(rows, pgx.RowToStructByName[LogEntry])
}

const createSQL = `
INSERT INTO gear_maintenance_log (gear_id, event_type, notes, event_date)
VALUES ($1, $2, $3, $4)
RETURNING log_id, gear_id, event_type, notes, event_date, created_at`

// Create appends a new maintenance log entry. Entries are immutable once created.
func (s *Store) Create(ctx context.Context, gearID pgtype.UUID, in CreateInput) (LogEntry, error) {
	notes := pgtype.Text{String: in.Notes, Valid: in.Notes != ""}
	rows, err := s.db.Query(ctx, createSQL, gearID, in.EventType, notes, in.EventDate)
	if err != nil {
		return LogEntry{}, err
	}
	return pgx.CollectExactlyOneRow(rows, pgx.RowToStructByName[LogEntry])
}
