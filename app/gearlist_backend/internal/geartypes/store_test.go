package geartypes_test

import (
	"context"
	"errors"
	"os"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/studiocontrolroom/gearlist_backend/internal/geartypes"
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

// withTx runs fn inside a transaction that is always rolled back.
func withTx(t *testing.T, pool *pgxpool.Pool, fn func(ctx context.Context, store *geartypes.Store)) {
	t.Helper()
	ctx := context.Background()
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatalf("begin: %v", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	fn(ctx, geartypes.NewStore(tx))
}

// ── List ──────────────────────────────────────────────────────────────────────

func TestStore_List_ReturnsInsertedType(t *testing.T) {
	pool := testPool(t)
	withTx(t, pool, func(ctx context.Context, s *geartypes.Store) {
		if _, err := s.Create(ctx, geartypes.CreateInput{Name: "TestListType"}, "testuser"); err != nil {
			t.Fatalf("create: %v", err)
		}
		types, err := s.List(ctx)
		if err != nil {
			t.Fatalf("list: %v", err)
		}
		found := false
		for _, gt := range types {
			if gt.TypeName == "TestListType" {
				found = true
				break
			}
		}
		if !found {
			t.Error("expected inserted type in list")
		}
	})
}

func TestStore_List_ExcludesDeleted(t *testing.T) {
	pool := testPool(t)
	withTx(t, pool, func(ctx context.Context, s *geartypes.Store) {
		gt, err := s.Create(ctx, geartypes.CreateInput{Name: "ToBeDeleted"}, "testuser")
		if err != nil {
			t.Fatalf("create: %v", err)
		}
		if err := s.SoftDelete(ctx, gt.TypeID, "testuser"); err != nil {
			t.Fatalf("delete: %v", err)
		}
		types, err := s.List(ctx)
		if err != nil {
			t.Fatalf("list: %v", err)
		}
		for _, listed := range types {
			if listed.TypeID == gt.TypeID {
				t.Error("deleted type should not appear in list")
			}
		}
	})
}

// ── Get ───────────────────────────────────────────────────────────────────────

func TestStore_Get_ReturnsRow(t *testing.T) {
	pool := testPool(t)
	withTx(t, pool, func(ctx context.Context, s *geartypes.Store) {
		created, err := s.Create(ctx, geartypes.CreateInput{Name: "FetchMe", Description: "desc"}, "testuser")
		if err != nil {
			t.Fatalf("create: %v", err)
		}
		got, err := s.Get(ctx, created.TypeID)
		if err != nil {
			t.Fatalf("get: %v", err)
		}
		if got.TypeName != "FetchMe" {
			t.Errorf("TypeName = %q, want FetchMe", got.TypeName)
		}
	})
}

func TestStore_Get_NotFound(t *testing.T) {
	pool := testPool(t)
	withTx(t, pool, func(ctx context.Context, s *geartypes.Store) {
		var id geartypes.TypeID
		id.Scan("ffffffff-ffff-ffff-ffff-ffffffffffff") //nolint:errcheck
		_, err := s.Get(ctx, id)
		if !errors.Is(err, pgx.ErrNoRows) {
			t.Errorf("expected pgx.ErrNoRows, got %v", err)
		}
	})
}

// ── Create ────────────────────────────────────────────────────────────────────

func TestStore_Create_ReturnsNewType(t *testing.T) {
	pool := testPool(t)
	withTx(t, pool, func(ctx context.Context, s *geartypes.Store) {
		gt, err := s.Create(ctx, geartypes.CreateInput{Name: "NewType", Description: "a description"}, "testuser")
		if err != nil {
			t.Fatalf("create: %v", err)
		}
		if gt.TypeName != "NewType" {
			t.Errorf("TypeName = %q, want NewType", gt.TypeName)
		}
		if !gt.TypeDescription.Valid || gt.TypeDescription.String != "a description" {
			t.Errorf("TypeDescription = %v, want 'a description'", gt.TypeDescription)
		}
	})
}

func TestStore_Create_WritesAuditLog(t *testing.T) {
	pool := testPool(t)
	withTx(t, pool, func(ctx context.Context, s *geartypes.Store) {
		gt, err := s.Create(ctx, geartypes.CreateInput{Name: "AuditedType"}, "audituser")
		if err != nil {
			t.Fatalf("create: %v", err)
		}
		var count int
		err = s.DB().QueryRow(ctx,
			`SELECT COUNT(*) FROM audit_log WHERE table_name='gear_types' AND record_id=$1 AND operation='CREATE'`,
			gt.TypeID,
		).Scan(&count)
		if err != nil {
			t.Fatalf("audit query: %v", err)
		}
		if count != 1 {
			t.Errorf("expected 1 audit row, got %d", count)
		}
	})
}

// ── Update ────────────────────────────────────────────────────────────────────

func TestStore_Update_ChangesFields(t *testing.T) {
	pool := testPool(t)
	withTx(t, pool, func(ctx context.Context, s *geartypes.Store) {
		gt, err := s.Create(ctx, geartypes.CreateInput{Name: "Original"}, "testuser")
		if err != nil {
			t.Fatalf("create: %v", err)
		}
		name := "Updated"
		updated, err := s.Update(ctx, gt.TypeID, geartypes.UpdateInput{Name: &name}, "testuser")
		if err != nil {
			t.Fatalf("update: %v", err)
		}
		if updated.TypeName != "Updated" {
			t.Errorf("TypeName = %q, want Updated", updated.TypeName)
		}
	})
}

func TestStore_Update_PartialPatch_PreservesOtherFields(t *testing.T) {
	pool := testPool(t)
	withTx(t, pool, func(ctx context.Context, s *geartypes.Store) {
		gt, err := s.Create(ctx, geartypes.CreateInput{Name: "KeepMe", Description: "keep this description"}, "testuser")
		if err != nil {
			t.Fatalf("create: %v", err)
		}
		name := "NewName"
		updated, err := s.Update(ctx, gt.TypeID, geartypes.UpdateInput{Name: &name}, "testuser")
		if err != nil {
			t.Fatalf("update: %v", err)
		}
		if !updated.TypeDescription.Valid || updated.TypeDescription.String != "keep this description" {
			t.Errorf("description was overwritten: %v", updated.TypeDescription)
		}
	})
}

// ── SoftDelete ────────────────────────────────────────────────────────────────

func TestStore_SoftDelete_HidesFromGet(t *testing.T) {
	pool := testPool(t)
	withTx(t, pool, func(ctx context.Context, s *geartypes.Store) {
		gt, err := s.Create(ctx, geartypes.CreateInput{Name: "DeleteMe"}, "testuser")
		if err != nil {
			t.Fatalf("create: %v", err)
		}
		if err := s.SoftDelete(ctx, gt.TypeID, "testuser"); err != nil {
			t.Fatalf("delete: %v", err)
		}
		_, err = s.Get(ctx, gt.TypeID)
		if !errors.Is(err, pgx.ErrNoRows) {
			t.Errorf("expected ErrNoRows after delete, got %v", err)
		}
	})
}

func TestStore_SoftDelete_IdempotentOnAlreadyDeleted(t *testing.T) {
	pool := testPool(t)
	withTx(t, pool, func(ctx context.Context, s *geartypes.Store) {
		gt, err := s.Create(ctx, geartypes.CreateInput{Name: "AlreadyGone"}, "testuser")
		if err != nil {
			t.Fatalf("create: %v", err)
		}
		s.SoftDelete(ctx, gt.TypeID, "testuser") //nolint:errcheck
		if err := s.SoftDelete(ctx, gt.TypeID, "testuser"); err != nil {
			t.Errorf("second soft delete should not error, got: %v", err)
		}
	})
}
