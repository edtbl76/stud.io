package store_test

import (
	"context"
	"encoding/json"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/studiocontrolroom/gearlist_backend/internal/store"
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

func TestWriteAudit_InsertsRow(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()

	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatalf("begin: %v", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	oldData, _ := json.Marshal(map[string]string{"gear_name": "old"})
	newData, _ := json.Marshal(map[string]string{"gear_name": "new"})

	var recordID pgtype.UUID
	if err := recordID.Scan("a0000000-0000-0000-0000-000000000001"); err != nil {
		t.Fatalf("scan uuid: %v", err)
	}

	entry := store.AuditEntry{
		TableName:   "gear",
		RecordID:    recordID,
		Operation:   "UPDATE",
		OldData:     oldData,
		NewData:     newData,
		PerformedBy: "testuser",
	}

	if err := store.WriteAudit(ctx, tx, entry); err != nil {
		t.Fatalf("WriteAudit: %v", err)
	}

	var count int
	err = tx.QueryRow(ctx,
		`SELECT COUNT(*) FROM audit_log
		 WHERE table_name = 'gear' AND record_id = $1 AND operation = 'UPDATE' AND performed_by = 'testuser'`,
		recordID,
	).Scan(&count)
	if err != nil {
		t.Fatalf("query: %v", err)
	}
	if count != 1 {
		t.Errorf("expected 1 audit row, got %d", count)
	}
}

func TestWriteAudit_RejectsInvalidOperation(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()

	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatalf("begin: %v", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var recordID pgtype.UUID
	recordID.Scan("a0000000-0000-0000-0000-000000000002") //nolint:errcheck

	entry := store.AuditEntry{
		TableName:   "gear",
		RecordID:    recordID,
		Operation:   "INVALID",
		PerformedBy: "testuser",
	}

	if err := store.WriteAudit(ctx, tx, entry); err == nil {
		t.Error("expected error for invalid operation, got nil")
	}
}
