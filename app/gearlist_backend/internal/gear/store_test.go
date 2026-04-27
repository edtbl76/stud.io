package gear_test

import (
	"context"
	"errors"
	"os"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/studiocontrolroom/gearlist_backend/internal/gear"
)

const defaultTestDSN = "postgresql://studio:studio@localhost:5432/masterdb_test"

func testPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dsn := os.Getenv("GEARLIST_TEST_DSN")
	if dsn == "" {
		dsn = defaultTestDSN
	}
	pool, err := pgxpool.New(context.Background(), dsn)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	t.Cleanup(pool.Close)
	return pool
}

func withTx(t *testing.T, pool *pgxpool.Pool, fn func(ctx context.Context, s *gear.Store)) {
	t.Helper()
	ctx := context.Background()
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatalf("begin: %v", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	fn(ctx, gear.NewStore(tx))
}

type rowQuerier interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// seedGearType inserts a throwaway gear type and returns its ID.
func seedGearType(t *testing.T, ctx context.Context, db rowQuerier, name string) pgtype.UUID {
	t.Helper()
	var id pgtype.UUID
	err := db.QueryRow(ctx,
		`INSERT INTO gear_types (type_name) VALUES ($1) ON CONFLICT (type_name) DO UPDATE SET type_name = EXCLUDED.type_name RETURNING type_id`, name,
	).Scan(&id)
	if err != nil {
		t.Fatalf("seed gear_type: %v", err)
	}
	return id
}

func minimalInput(typeID pgtype.UUID) gear.CreateInput {
	return gear.CreateInput{GearName: "Test Guitar", GearTypeID: typeID}
}

// withGear seeds a gear_type and gear row, then runs fn inside the same transaction.
func withGear(t *testing.T, pool *pgxpool.Pool, typeName string, fn func(ctx context.Context, s *gear.Store, g gear.GearView)) {
	t.Helper()
	withTx(t, pool, func(ctx context.Context, s *gear.Store) {
		typeID := seedGearType(t, ctx, s.TX(), typeName)
		g, err := s.Create(ctx, minimalInput(typeID), "u")
		if err != nil {
			t.Fatalf("seed gear: %v", err)
		}
		fn(ctx, s, g)
	})
}

// ── List ──────────────────────────────────────────────────────────────────────

func TestStore_List_ReturnsResult(t *testing.T) {
	withGear(t, testPool(t), "ListTestType", func(ctx context.Context, s *gear.Store, _ gear.GearView) {
		result, err := s.List(ctx, gear.ListFilter{Limit: 10})
		if err != nil {
			t.Fatalf("list: %v", err)
		}
		if result.Total < 1 {
			t.Errorf("expected at least 1 total, got %d", result.Total)
		}
	})
}

func TestStore_List_FilterByName(t *testing.T) {
	pool := testPool(t)
	withTx(t, pool, func(ctx context.Context, s *gear.Store) {
		tx := s.TX()
		typeID := seedGearType(t, ctx, tx, "FilterNameType")
		s.Create(ctx, gear.CreateInput{GearName: "FindThisOne", GearTypeID: typeID}, "u")   //nolint:errcheck
		s.Create(ctx, gear.CreateInput{GearName: "IgnoreThisOne", GearTypeID: typeID}, "u") //nolint:errcheck

		result, err := s.List(ctx, gear.ListFilter{Name: "FindThis", Limit: 10})
		if err != nil {
			t.Fatalf("list: %v", err)
		}
		for _, g := range result.Items {
			if g.GearName == "IgnoreThisOne" {
				t.Error("filter should have excluded IgnoreThisOne")
			}
		}
	})
}

func TestStore_List_ExcludesDeleted(t *testing.T) {
	pool := testPool(t)
	withTx(t, pool, func(ctx context.Context, s *gear.Store) {
		tx := s.TX()
		typeID := seedGearType(t, ctx, tx, "DeletedType")
		g, err := s.Create(ctx, minimalInput(typeID), "u")
		if err != nil {
			t.Fatalf("create: %v", err)
		}
		s.SoftDelete(ctx, g.GearID, "u") //nolint:errcheck

		result, err := s.List(ctx, gear.ListFilter{Limit: 100})
		if err != nil {
			t.Fatalf("list: %v", err)
		}
		for _, listed := range result.Items {
			if listed.GearID == g.GearID {
				t.Error("deleted gear should not appear in list")
			}
		}
	})
}

// ── Get ───────────────────────────────────────────────────────────────────────

func TestStore_Get_ReturnsRow(t *testing.T) {
	withGear(t, testPool(t), "GetTestType", func(ctx context.Context, s *gear.Store, created gear.GearView) {
		got, err := s.Get(ctx, created.GearID)
		if err != nil {
			t.Fatalf("get: %v", err)
		}
		if got.GearName != "Test Guitar" {
			t.Errorf("GearName = %q, want Test Guitar", got.GearName)
		}
	})
}

func TestStore_Get_NotFound(t *testing.T) {
	pool := testPool(t)
	withTx(t, pool, func(ctx context.Context, s *gear.Store) {
		var id pgtype.UUID
		id.Scan("ffffffff-ffff-ffff-ffff-ffffffffffff") //nolint:errcheck
		_, err := s.Get(ctx, id)
		if !errors.Is(err, pgx.ErrNoRows) {
			t.Errorf("expected ErrNoRows, got %v", err)
		}
	})
}

// ── Create ────────────────────────────────────────────────────────────────────

func TestStore_Create_SetsRequiredFields(t *testing.T) {
	pool := testPool(t)
	withTx(t, pool, func(ctx context.Context, s *gear.Store) {
		tx := s.TX()
		typeID := seedGearType(t, ctx, tx, "CreateTestType")
		g, err := s.Create(ctx, minimalInput(typeID), "testuser")
		if err != nil {
			t.Fatalf("create: %v", err)
		}
		if g.GearName != "Test Guitar" {
			t.Errorf("GearName = %q, want Test Guitar", g.GearName)
		}
		if g.GearTypeID != typeID {
			t.Errorf("GearTypeID mismatch")
		}
	})
}

func TestStore_Create_WritesAuditLog(t *testing.T) {
	pool := testPool(t)
	withTx(t, pool, func(ctx context.Context, s *gear.Store) {
		tx := s.TX()
		typeID := seedGearType(t, ctx, tx, "AuditType")
		g, err := s.Create(ctx, minimalInput(typeID), "audituser")
		if err != nil {
			t.Fatalf("create: %v", err)
		}
		var count int
		tx.QueryRow(ctx, //nolint:errcheck
			`SELECT COUNT(*) FROM audit_log WHERE table_name='gear' AND record_id=$1 AND operation='CREATE'`,
			g.GearID,
		).Scan(&count)
		if count != 1 {
			t.Errorf("expected 1 audit row, got %d", count)
		}
	})
}

// ── Update ────────────────────────────────────────────────────────────────────

func TestStore_Update_ChangesGearName(t *testing.T) {
	withGear(t, testPool(t), "UpdateType", func(ctx context.Context, s *gear.Store, g gear.GearView) {
		name := "Renamed Guitar"
		updated, err := s.Update(ctx, g.GearID, gear.UpdateInput{GearName: &name}, "u")
		if err != nil {
			t.Fatalf("update: %v", err)
		}
		if updated.GearName != "Renamed Guitar" {
			t.Errorf("GearName = %q, want Renamed Guitar", updated.GearName)
		}
	})
}

// ── SoftDelete ────────────────────────────────────────────────────────────────

func TestStore_SoftDelete_HidesFromGet(t *testing.T) {
	pool := testPool(t)
	withTx(t, pool, func(ctx context.Context, s *gear.Store) {
		tx := s.TX()
		typeID := seedGearType(t, ctx, tx, "DeleteType")
		g, err := s.Create(ctx, minimalInput(typeID), "u")
		if err != nil {
			t.Fatalf("create: %v", err)
		}
		if err := s.SoftDelete(ctx, g.GearID, "u"); err != nil {
			t.Fatalf("delete: %v", err)
		}
		_, err = s.Get(ctx, g.GearID)
		if !errors.Is(err, pgx.ErrNoRows) {
			t.Errorf("expected ErrNoRows after delete, got %v", err)
		}
	})
}

// ── SetPhotoKey ───────────────────────────────────────────────────────────────

func TestStore_SetPhotoKey_UpdatesField(t *testing.T) {
	pool := testPool(t)
	withTx(t, pool, func(ctx context.Context, s *gear.Store) {
		tx := s.TX()
		typeID := seedGearType(t, ctx, tx, "PhotoType")
		g, err := s.Create(ctx, minimalInput(typeID), "u")
		if err != nil {
			t.Fatalf("create: %v", err)
		}
		if err := s.SetPhotoKey(ctx, g.GearID, "gear/abc/photo.jpg", "u"); err != nil {
			t.Fatalf("set photo key: %v", err)
		}
		got, err := s.Get(ctx, g.GearID)
		if err != nil {
			t.Fatalf("get: %v", err)
		}
		if !got.PhotoKey.Valid || got.PhotoKey.String != "gear/abc/photo.jpg" {
			t.Errorf("PhotoKey = %v, want gear/abc/photo.jpg", got.PhotoKey)
		}
	})
}

// ── History ───────────────────────────────────────────────────────────────────

func TestStore_History_ReturnsAuditEntries(t *testing.T) {
	pool := testPool(t)
	withTx(t, pool, func(ctx context.Context, s *gear.Store) {
		tx := s.TX()
		typeID := seedGearType(t, ctx, tx, "HistoryType")
		g, err := s.Create(ctx, minimalInput(typeID), "historyuser")
		if err != nil {
			t.Fatalf("create: %v", err)
		}
		entries, err := s.History(ctx, g.GearID)
		if err != nil {
			t.Fatalf("history: %v", err)
		}
		if len(entries) < 1 {
			t.Error("expected at least 1 audit entry (CREATE)")
		}
		if entries[0].Operation != "CREATE" {
			t.Errorf("first entry operation = %q, want CREATE", entries[0].Operation)
		}
	})
}
