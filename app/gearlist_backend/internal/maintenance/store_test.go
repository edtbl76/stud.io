package maintenance_test

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/studiocontrolroom/gearlist_backend/internal/maintenance"
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

func withTx(t *testing.T, pool *pgxpool.Pool, fn func(ctx context.Context, s *maintenance.Store, gearID pgtype.UUID)) {
	t.Helper()
	ctx := context.Background()
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatalf("begin: %v", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	// seed a gear_type and gear row for the test
	var typeID pgtype.UUID
	if err := tx.QueryRow(ctx,
		`INSERT INTO gear_types (type_name) VALUES ('MaintenanceTestType') ON CONFLICT (type_name) DO UPDATE SET type_name = EXCLUDED.type_name RETURNING type_id`,
	).Scan(&typeID); err != nil {
		t.Fatalf("seed gear_type: %v", err)
	}
	var gearID pgtype.UUID
	if err := tx.QueryRow(ctx,
		`INSERT INTO gear (gear_name, gear_type_id) VALUES ('Test Gear', $1) RETURNING gear_id`, typeID,
	).Scan(&gearID); err != nil {
		t.Fatalf("seed gear: %v", err)
	}

	fn(ctx, maintenance.NewStore(tx), gearID)
}

// ── List ──────────────────────────────────────────────────────────────────────

func TestStore_List_ReturnsInsertedEntries(t *testing.T) {
	pool := testPool(t)
	withTx(t, pool, func(ctx context.Context, s *maintenance.Store, gearID pgtype.UUID) {
		in := maintenance.CreateInput{
			EventType: "restring",
			Notes:     "Changed to 10s",
			EventDate: time.Now(),
		}
		if _, err := s.Create(ctx, gearID, in); err != nil {
			t.Fatalf("create: %v", err)
		}
		entries, err := s.List(ctx, gearID)
		if err != nil {
			t.Fatalf("list: %v", err)
		}
		if len(entries) < 1 {
			t.Error("expected at least 1 entry")
		}
	})
}

// ── Create ────────────────────────────────────────────────────────────────────

func TestStore_Create_SetsEventType(t *testing.T) {
	pool := testPool(t)
	withTx(t, pool, func(ctx context.Context, s *maintenance.Store, gearID pgtype.UUID) {
		in := maintenance.CreateInput{
			EventType: "setup",
			Notes:     "Intonation adjusted",
			EventDate: time.Now(),
		}
		entry, err := s.Create(ctx, gearID, in)
		if err != nil {
			t.Fatalf("create: %v", err)
		}
		if entry.EventType != "setup" {
			t.Errorf("EventType = %q, want setup", entry.EventType)
		}
	})
}

func TestStore_Create_RejectsInvalidEventType(t *testing.T) {
	pool := testPool(t)
	withTx(t, pool, func(ctx context.Context, s *maintenance.Store, gearID pgtype.UUID) {
		in := maintenance.CreateInput{
			EventType: "invalid_type",
			EventDate: time.Now(),
		}
		if _, err := s.Create(ctx, gearID, in); err == nil {
			t.Error("expected error for invalid event_type, got nil")
		}
	})
}
