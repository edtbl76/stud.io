package geartypes

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/studiocontrolroom/gearlist_backend/internal/store"
)

// TypeID is an alias so callers can reference it without importing pgtype directly.
type TypeID = pgtype.UUID

// GearType is a row from the gear_types table.
type GearType struct {
	TypeID          pgtype.UUID
	TypeName        string
	TypeDescription pgtype.Text
}

// CreateInput holds the required fields for creating a gear type.
type CreateInput struct {
	Name        string
	Description string
}

// UpdateInput holds the optional fields for a PATCH request.
// A nil pointer means the field is not being updated.
type UpdateInput struct {
	Name        *string
	Description *string
}

// querier is satisfied by *pgxpool.Pool and pgx.Tx.
// Begin is required so write methods can open their own transaction, making
// the DML and the audit INSERT atomic regardless of the backing implementation.
type querier interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
	Begin(ctx context.Context) (pgx.Tx, error)
}

// Store provides data access for gear_types.
type Store struct{ db querier }

// NewStore returns a Store backed by db.
func NewStore(db querier) *Store { return &Store{db: db} }

// DB exposes the underlying querier for test helpers that need raw access.
func (s *Store) DB() querier { return s.db }

const listSQL = `
SELECT type_id, type_name, type_description
FROM   gear_types
WHERE  deleted_at IS NULL
ORDER  BY type_name`

// List returns all non-deleted gear types ordered by name.
func (s *Store) List(ctx context.Context) ([]GearType, error) {
	rows, err := s.db.Query(ctx, listSQL)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return pgx.CollectRows(rows, pgx.RowToStructByName[GearType])
}

const getSQL = `
SELECT type_id, type_name, type_description
FROM   gear_types
WHERE  type_id = $1 AND deleted_at IS NULL`

// Get returns a single non-deleted gear type by ID.
func (s *Store) Get(ctx context.Context, id TypeID) (GearType, error) {
	rows, err := s.db.Query(ctx, getSQL, id)
	if err != nil {
		return GearType{}, err
	}
	return pgx.CollectExactlyOneRow(rows, pgx.RowToStructByName[GearType])
}

const createSQL = `
INSERT INTO gear_types (type_name, type_description)
VALUES ($1, $2)
RETURNING type_id, type_name, type_description`

// Create inserts a new gear type and writes an audit entry.
func (s *Store) Create(ctx context.Context, in CreateInput, performedBy string) (GearType, error) {
	return s.txResult(ctx, func(txs *Store) (GearType, error) {
		rows, err := txs.db.Query(ctx, createSQL, in.Name, nullableText(in.Description))
		if err != nil {
			return GearType{}, err
		}
		gt, err := pgx.CollectExactlyOneRow(rows, pgx.RowToStructByName[GearType])
		if err != nil {
			return GearType{}, err
		}
		newJSON, _ := json.Marshal(gt)
		return gt, store.WriteAudit(ctx, txs.db, store.AuditEntry{
			TableName: "gear_types", RecordID: gt.TypeID,
			Operation: "CREATE", NewData: newJSON, PerformedBy: performedBy,
		})
	})
}

const updateSQL = `
UPDATE gear_types
SET    type_name        = COALESCE($1, type_name),
       type_description = COALESCE($2, type_description)
WHERE  type_id = $3 AND deleted_at IS NULL
RETURNING type_id, type_name, type_description`

// Update applies a partial update to a gear type and writes an audit entry.
func (s *Store) Update(ctx context.Context, id TypeID, in UpdateInput, performedBy string) (GearType, error) {
	return s.txResult(ctx, func(txs *Store) (GearType, error) {
		old, err := txs.Get(ctx, id)
		if err != nil {
			return GearType{}, err
		}
		rows, err := txs.db.Query(ctx, updateSQL, nilIfEmpty(in.Name), nilIfEmpty(in.Description), id)
		if err != nil {
			return GearType{}, err
		}
		updated, err := pgx.CollectExactlyOneRow(rows, pgx.RowToStructByName[GearType])
		if err != nil {
			return GearType{}, err
		}
		oldJSON, _ := json.Marshal(old)
		newJSON, _ := json.Marshal(updated)
		return updated, store.WriteAudit(ctx, txs.db, store.AuditEntry{
			TableName: "gear_types", RecordID: id,
			Operation: "UPDATE", OldData: oldJSON, NewData: newJSON, PerformedBy: performedBy,
		})
	})
}

const softDeleteSQL = `
UPDATE gear_types SET deleted_at = NOW()
WHERE  type_id = $1 AND deleted_at IS NULL`

// SoftDelete marks a gear type as deleted. Idempotent if already deleted.
func (s *Store) SoftDelete(ctx context.Context, id TypeID, performedBy string) error {
	old, err := s.Get(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil // already deleted or not found — idempotent
		}
		return err
	}
	oldJSON, _ := json.Marshal(old)
	return s.runInTx(ctx, func(txs *Store) error {
		tag, err := txs.db.Exec(ctx, softDeleteSQL, id)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return nil // deleted between Get and Exec — idempotent
		}
		return store.WriteAudit(ctx, txs.db, store.AuditEntry{
			TableName: "gear_types", RecordID: id,
			Operation: "DELETE", OldData: oldJSON, PerformedBy: performedBy,
		})
	})
}

// runInTx starts a transaction, runs fn on a transaction-backed store, and
// commits on success. The transaction rolls back automatically on any failure.
func (s *Store) runInTx(ctx context.Context, fn func(*Store) error) error {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	if err := fn(&Store{db: tx}); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// txResult is like runInTx but for methods that return a GearType.
func (s *Store) txResult(ctx context.Context, fn func(*Store) (GearType, error)) (GearType, error) {
	var v GearType
	err := s.runInTx(ctx, func(txs *Store) error {
		var err error
		v, err = fn(txs)
		return err
	})
	return v, err
}

func nullableText(s string) pgtype.Text {
	return pgtype.Text{String: s, Valid: s != ""}
}

// nilIfEmpty converts a non-nil pointer to "" into nil so COALESCE in
// partial-update SQL treats it as "no change" -- consistent with nullableText.
func nilIfEmpty(s *string) *string {
	if s != nil && *s == "" {
		return nil
	}
	return s
}
