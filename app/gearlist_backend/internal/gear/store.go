package gear

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/studiocontrolroom/gearlist_backend/internal/store"
)

// GearID is an alias so callers can reference it without importing pgtype directly.
type GearID = pgtype.UUID

// GearView is a row from gear_view, with FK columns resolved to display names.
type GearView struct {
	GearID              pgtype.UUID        `db:"gear_id"`
	GearName            string             `db:"gear_name"`
	GearTypeID          pgtype.UUID        `db:"gear_type_id"`
	GearTypeName        pgtype.Text        `db:"gear_type_name"`
	BrandID             pgtype.UUID        `db:"brand_id"`
	ModelID             pgtype.UUID        `db:"model_id"`
	SerialNumber        pgtype.Text        `db:"serial_number"`
	Year                pgtype.Int4        `db:"year"`
	OwnerID             pgtype.UUID        `db:"owner_id"`
	PhotoKey            pgtype.Text        `db:"photo_key"`
	Notes               pgtype.Text        `db:"notes"`
	NumStrings          pgtype.Int4        `db:"num_strings"`
	Tuning              pgtype.Text        `db:"tuning"`
	PickupConfig        pgtype.Text        `db:"pickup_config"`
	PickupNeckModelID   pgtype.UUID        `db:"pickup_neck_model_id"`
	PickupMiddleModelID pgtype.UUID        `db:"pickup_middle_model_id"`
	PickupBridgeModelID pgtype.UUID        `db:"pickup_bridge_model_id"`
	StringsModelID      pgtype.UUID        `db:"strings_model_id"`
	CreatedAt           pgtype.Timestamptz `db:"created_at"`
	UpdatedAt           pgtype.Timestamptz `db:"updated_at"`
}

// AuditRow is a single row from audit_log for gear history.
type AuditRow struct {
	Operation   string             `db:"operation"`
	OldData     []byte             `db:"old_data"`
	NewData     []byte             `db:"new_data"`
	PerformedBy string             `db:"performed_by"`
	PerformedAt pgtype.Timestamptz `db:"performed_at"`
}

// CreateInput holds the fields for creating a new gear item.
type CreateInput struct {
	GearName            string      `json:"gear_name"`
	GearTypeID          pgtype.UUID `json:"gear_type_id"`
	BrandID             pgtype.UUID `json:"brand_id"`
	ModelID             pgtype.UUID `json:"model_id"`
	SerialNumber        pgtype.Text `json:"serial_number"`
	Year                pgtype.Int4 `json:"year"`
	OwnerID             pgtype.UUID `json:"owner_id"`
	Notes               pgtype.Text `json:"notes"`
	NumStrings          pgtype.Int4 `json:"num_strings"`
	Tuning              pgtype.Text `json:"tuning"`
	PickupConfig        pgtype.Text `json:"pickup_config"`
	PickupNeckModelID   pgtype.UUID `json:"pickup_neck_model_id"`
	PickupMiddleModelID pgtype.UUID `json:"pickup_middle_model_id"`
	PickupBridgeModelID pgtype.UUID `json:"pickup_bridge_model_id"`
	StringsModelID      pgtype.UUID `json:"strings_model_id"`
}

// UpdateInput holds optional fields for a PATCH. Nil pointer = do not update.
type UpdateInput struct {
	GearName            *string      `json:"gear_name"`
	GearTypeID          *pgtype.UUID `json:"gear_type_id"`
	BrandID             *pgtype.UUID `json:"brand_id"`
	ModelID             *pgtype.UUID `json:"model_id"`
	SerialNumber        *string      `json:"serial_number"`
	Year                *int32       `json:"year"`
	OwnerID             *pgtype.UUID `json:"owner_id"`
	Notes               *string      `json:"notes"`
	NumStrings          *int32       `json:"num_strings"`
	Tuning              *string      `json:"tuning"`
	PickupConfig        *string      `json:"pickup_config"`
	PickupNeckModelID   *pgtype.UUID `json:"pickup_neck_model_id"`
	PickupMiddleModelID *pgtype.UUID `json:"pickup_middle_model_id"`
	PickupBridgeModelID *pgtype.UUID `json:"pickup_bridge_model_id"`
	StringsModelID      *pgtype.UUID `json:"strings_model_id"`
}

// ListFilter controls which rows List returns.
type ListFilter struct {
	Name   string
	TypeID *pgtype.UUID
	Limit  int
	Offset int
}

// ListResult is the paginated response shape.
type ListResult struct {
	Items []GearView `json:"items"`
	Total int        `json:"total"`
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

// Store provides data access for the gear resource.
type Store struct{ db querier }

// NewStore returns a Store backed by db.
func NewStore(db querier) *Store { return &Store{db: db} }

// TX returns the underlying querier as a QueryRow-capable interface for test helpers.
func (s *Store) TX() interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
} {
	return s.db
}

// ── List ──────────────────────────────────────────────────────────────────────

const listCountSQL = `
SELECT COUNT(*) FROM gear_view
WHERE ($1::text IS NULL OR gear_name ILIKE '%' || $1 || '%')
  AND ($2::uuid IS NULL OR gear_type_id = $2)`

const listDataSQL = `
SELECT gear_id, gear_name, gear_type_id, gear_type_name, brand_id, model_id,
       serial_number, year, owner_id, photo_key, notes, num_strings, tuning,
       pickup_config, pickup_neck_model_id, pickup_middle_model_id,
       pickup_bridge_model_id, strings_model_id, created_at, updated_at
FROM   gear_view
WHERE  ($1::text IS NULL OR gear_name ILIKE '%' || $1 || '%')
  AND  ($2::uuid IS NULL OR gear_type_id = $2)
ORDER  BY gear_name
LIMIT  $3 OFFSET $4`

// List returns a filtered, paginated list of gear items.
func (s *Store) List(ctx context.Context, f ListFilter) (ListResult, error) {
	nameArg, typeArg := filterArgs(f)
	limit := max(f.Limit, 1)
	var total int
	if err := s.db.QueryRow(ctx, listCountSQL, nameArg, typeArg).Scan(&total); err != nil {
		return ListResult{}, err
	}
	rows, err := s.db.Query(ctx, listDataSQL, nameArg, typeArg, limit, f.Offset)
	if err != nil {
		return ListResult{}, err
	}
	defer rows.Close()
	items, err := pgx.CollectRows(rows, pgx.RowToStructByName[GearView])
	if err != nil {
		return ListResult{}, err
	}
	return ListResult{Items: items, Total: total}, nil
}

func filterArgs(f ListFilter) (any, any) {
	var name any
	var typeID any
	if f.Name != "" {
		name = f.Name
	}
	if f.TypeID != nil {
		typeID = *f.TypeID
	}
	return name, typeID
}

// ── Get ───────────────────────────────────────────────────────────────────────

const getByIDSQL = `
SELECT gear_id, gear_name, gear_type_id, gear_type_name, brand_id, model_id,
       serial_number, year, owner_id, photo_key, notes, num_strings, tuning,
       pickup_config, pickup_neck_model_id, pickup_middle_model_id,
       pickup_bridge_model_id, strings_model_id, created_at, updated_at
FROM   gear_view
WHERE  gear_id = $1`

// Get returns a single gear item by ID. Returns pgx.ErrNoRows if not found or deleted.
func (s *Store) Get(ctx context.Context, id GearID) (GearView, error) {
	rows, err := s.db.Query(ctx, getByIDSQL, id)
	if err != nil {
		return GearView{}, err
	}
	return pgx.CollectExactlyOneRow(rows, pgx.RowToStructByName[GearView])
}

// ── Create ────────────────────────────────────────────────────────────────────

const createSQL = `
INSERT INTO gear (
    gear_name, gear_type_id, brand_id, model_id, serial_number, year,
    owner_id, notes, num_strings, tuning, pickup_config,
    pickup_neck_model_id, pickup_middle_model_id, pickup_bridge_model_id, strings_model_id
) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
RETURNING gear_id`

// Create inserts a new gear item, then returns it from gear_view.
func (s *Store) Create(ctx context.Context, in CreateInput, performedBy string) (GearView, error) {
	var gv GearView
	err := s.runInTx(ctx, func(txs *Store) error {
		var id GearID
		if err := txs.db.QueryRow(ctx, createSQL,
			in.GearName, in.GearTypeID, in.BrandID, in.ModelID, in.SerialNumber, in.Year,
			in.OwnerID, in.Notes, in.NumStrings, in.Tuning, in.PickupConfig,
			in.PickupNeckModelID, in.PickupMiddleModelID, in.PickupBridgeModelID, in.StringsModelID,
		).Scan(&id); err != nil {
			return err
		}
		var err error
		gv, err = txs.fetchAndAudit(ctx, id, auditOp{op: "CREATE", performedBy: performedBy})
		return err
	})
	return gv, err
}

// ── Update ────────────────────────────────────────────────────────────────────

const updateSQL = `
UPDATE gear
SET gear_name              = COALESCE($1,  gear_name),
    gear_type_id           = COALESCE($2,  gear_type_id),
    brand_id               = COALESCE($3,  brand_id),
    model_id               = COALESCE($4,  model_id),
    serial_number          = COALESCE($5,  serial_number),
    year                   = COALESCE($6,  year),
    owner_id               = COALESCE($7,  owner_id),
    notes                  = COALESCE($8,  notes),
    num_strings            = COALESCE($9,  num_strings),
    tuning                 = COALESCE($10, tuning),
    pickup_config          = COALESCE($11, pickup_config),
    pickup_neck_model_id   = COALESCE($12, pickup_neck_model_id),
    pickup_middle_model_id = COALESCE($13, pickup_middle_model_id),
    pickup_bridge_model_id = COALESCE($14, pickup_bridge_model_id),
    strings_model_id       = COALESCE($15, strings_model_id),
    updated_at             = NOW()
WHERE gear_id = $16 AND deleted_at IS NULL`

// Update applies a partial update and returns the updated view row.
func (s *Store) Update(ctx context.Context, id GearID, in UpdateInput, performedBy string) (GearView, error) {
	return s.txResult(ctx, func(txs *Store) (GearView, error) {
		old, err := txs.Get(ctx, id)
		if err != nil {
			return GearView{}, err
		}
		if _, err = txs.db.Exec(ctx, updateSQL,
			in.GearName, in.GearTypeID, in.BrandID, in.ModelID, in.SerialNumber,
			in.Year, in.OwnerID, in.Notes, in.NumStrings, in.Tuning, in.PickupConfig,
			in.PickupNeckModelID, in.PickupMiddleModelID, in.PickupBridgeModelID, in.StringsModelID,
			id,
		); err != nil {
			return GearView{}, err
		}
		oldJSON, _ := json.Marshal(old)
		return txs.fetchAndAudit(ctx, id, auditOp{op: "UPDATE", oldJSON: oldJSON, performedBy: performedBy})
	})
}

// ── SoftDelete ────────────────────────────────────────────────────────────────

const softDeleteSQL = `UPDATE gear SET deleted_at = NOW() WHERE gear_id = $1 AND deleted_at IS NULL`

// SoftDelete marks a gear item as deleted. Idempotent if already deleted.
func (s *Store) SoftDelete(ctx context.Context, id GearID, performedBy string) error {
	return s.runInTx(ctx, func(txs *Store) error {
		return txs.execWithAudit(ctx, id, writeAuditCfg{
			sql: softDeleteSQL, sqlArgs: []any{id},
			auditOp: auditOp{op: "DELETE", performedBy: performedBy},
		})
	})
}

// ── SetPhotoKey ───────────────────────────────────────────────────────────────

const setPhotoSQL = `UPDATE gear SET photo_key = $1, updated_at = NOW() WHERE gear_id = $2 AND deleted_at IS NULL`

// SetPhotoKey stores the MinIO object key for a gear item's photo.
func (s *Store) SetPhotoKey(ctx context.Context, id GearID, key, performedBy string) error {
	return s.runInTx(ctx, func(txs *Store) error {
		return txs.execWithAudit(ctx, id, writeAuditCfg{
			sql: setPhotoSQL, sqlArgs: []any{key, id},
			notFoundErr: fmt.Errorf("gear not found"),
			auditOp:     auditOp{op: "UPDATE", performedBy: performedBy},
		})
	})
}

// ── History ───────────────────────────────────────────────────────────────────

const historySQL = `
SELECT operation, old_data, new_data, performed_by, performed_at
FROM   audit_log
WHERE  table_name = 'gear' AND record_id = $1
ORDER  BY performed_at DESC`

// History returns all audit log entries for a gear item, newest first.
func (s *Store) History(ctx context.Context, id GearID) ([]AuditRow, error) {
	rows, err := s.db.Query(ctx, historySQL, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return pgx.CollectRows(rows, pgx.RowToStructByName[AuditRow])
}

// ── helpers ───────────────────────────────────────────────────────────────────

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

// txResult is like runInTx but for methods that return a GearView.
func (s *Store) txResult(ctx context.Context, fn func(*Store) (GearView, error)) (GearView, error) {
	var v GearView
	err := s.runInTx(ctx, func(txs *Store) error {
		var err error
		v, err = fn(txs)
		return err
	})
	return v, err
}

type auditOp struct {
	op          string
	oldJSON     []byte
	performedBy string
}

type writeAuditCfg struct {
	sql         string
	sqlArgs     []any
	notFoundErr error // nil means return nil on not found (idempotent)
	auditOp     auditOp
}

// fetchAndAudit gets the current view row and writes an audit entry.
func (s *Store) fetchAndAudit(ctx context.Context, id GearID, a auditOp) (GearView, error) {
	gv, err := s.Get(ctx, id)
	if err != nil {
		return GearView{}, err
	}
	newJSON, _ := json.Marshal(gv)
	return gv, store.WriteAudit(ctx, s.db, store.AuditEntry{
		TableName: "gear", RecordID: id, Operation: a.op,
		OldData: a.oldJSON, NewData: newJSON, PerformedBy: a.performedBy,
	})
}

// execWithAudit fetches the gear row, runs the configured DML, then writes
// an audit entry. Only pgx.ErrNoRows from Get translates to cfg.notFoundErr;
// other Get errors are returned directly. A zero-rows-affected Exec also
// returns cfg.notFoundErr without auditing.
func (s *Store) execWithAudit(ctx context.Context, id GearID, cfg writeAuditCfg) error {
	old, err := s.Get(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return cfg.notFoundErr
		}
		return err
	}
	tag, err := s.db.Exec(ctx, cfg.sql, cfg.sqlArgs...)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return cfg.notFoundErr
	}
	return s.auditGear(ctx, id, old, cfg.auditOp)
}

// auditGear marshals old and writes an audit entry for a completed write.
// For non-DELETE operations it re-fetches the current row as NewData.
func (s *Store) auditGear(ctx context.Context, id GearID, old GearView, a auditOp) error {
	oldJSON, _ := json.Marshal(old)
	var newJSON []byte
	if a.op != "DELETE" {
		gv, err := s.Get(ctx, id)
		if err != nil {
			return fmt.Errorf("audit refetch: %w", err)
		}
		newJSON, _ = json.Marshal(gv)
	}
	return store.WriteAudit(ctx, s.db, store.AuditEntry{
		TableName: "gear", RecordID: id, Operation: a.op,
		OldData: oldJSON, NewData: newJSON, PerformedBy: a.performedBy,
	})
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
