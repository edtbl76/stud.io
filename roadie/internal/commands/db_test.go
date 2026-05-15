package commands

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"github.com/studiocontrolroom/roadie/internal/config"
	"github.com/studiocontrolroom/roadie/internal/providers"
)

// ---------------------------------------------------------------------------
// fakeDB — in-memory SQLDatabaseProvider for migrate tests
// ---------------------------------------------------------------------------

type fakeDB struct {
	applied   map[string]bool
	execErr   error
	queryErr  error
	fileErr   error
	mu        sync.Mutex
	execCalls []string
}

func newFakeDB(applied ...string) *fakeDB {
	f := &fakeDB{applied: make(map[string]bool)}
	for _, name := range applied {
		f.applied[name] = true
	}
	return f
}

func (f *fakeDB) IsReady(_ context.Context, _ providers.DBConfig) (bool, error) { return true, nil }
func (f *fakeDB) ExecSQL(_ context.Context, _ providers.DBConfig, sql string) error {
	f.mu.Lock()
	f.execCalls = append(f.execCalls, sql)
	f.mu.Unlock()
	return f.execErr
}
func (f *fakeDB) ExecSQLFile(_ context.Context, _ providers.DBConfig, path string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.execCalls = append(f.execCalls, "FILE:"+filepath.Base(path))
	return f.fileErr
}
func (f *fakeDB) QueryRows(_ context.Context, _ providers.DBConfig, _ string) ([]string, error) {
	if f.queryErr != nil {
		return nil, f.queryErr
	}
	var rows []string
	for name := range f.applied {
		rows = append(rows, name)
	}
	return rows, nil
}

func migrateConfig() *config.Config {
	return &config.Config{
		Providers: config.ProvidersConfig{
			Database: config.DatabaseProviderConfig{
				Service: "studio_db",
				User:    "studio",
				DBName:  "masterdb",
			},
		},
	}
}

// ---------------------------------------------------------------------------
// migrator tests
// ---------------------------------------------------------------------------

func writeMigration(t *testing.T, dir, name, content string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(dir, name), []byte(content), 0644); err != nil {
		t.Fatal(err)
	}
}

func applyToDir(t *testing.T, db *fakeDB, dir string) (string, error) {
	t.Helper()
	var out strings.Builder
	m, err := newMigrator(migrateConfig(), db, &out)
	if err != nil {
		return "", err
	}
	err = m.apply(context.Background(), dir)
	return out.String(), err
}

func TestRunMigrate_NothingCases(t *testing.T) {
	cases := []struct {
		name    string
		setup   func(t *testing.T, dir string)
		applied []string
	}{
		{
			name:    "empty dir",
			setup:   func(_ *testing.T, _ string) {},
			applied: nil,
		},
		{
			name: "all already applied",
			setup: func(t *testing.T, dir string) {
				writeMigration(t, dir, "001_init.sql", "SELECT 1;")
			},
			applied: []string{"001_init.sql"},
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			dir := t.TempDir()
			tc.setup(t, dir)
			out, err := applyToDir(t, newFakeDB(tc.applied...), dir)
			if err != nil {
				t.Fatal(err)
			}
			if !strings.Contains(out, "Nothing to apply") {
				t.Errorf("expected nothing-to-apply, got: %s", out)
			}
		})
	}
}

func TestRunMigrate_AppliesCases(t *testing.T) {
	cases := []struct {
		name      string
		setup     func(t *testing.T, dir string)
		wantCount int
	}{
		{
			name: "applies all new migrations",
			setup: func(t *testing.T, dir string) {
				writeMigration(t, dir, "001_init.sql", "SELECT 1;")
				writeMigration(t, dir, "002_add_col.sql", "SELECT 2;")
			},
			wantCount: 2,
		},
		{
			name: "ignores non-sql files",
			setup: func(t *testing.T, dir string) {
				writeMigration(t, dir, "001_init.sql", "SELECT 1;")
				os.WriteFile(filepath.Join(dir, "README.md"), []byte("docs"), 0644) //nolint:errcheck
			},
			wantCount: 1,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			dir := t.TempDir()
			tc.setup(t, dir)
			out, err := applyToDir(t, newFakeDB(), dir)
			if err != nil {
				t.Fatal(err)
			}
			want := fmt.Sprintf("Applied %d migration(s)", tc.wantCount)
			if !strings.Contains(out, want) {
				t.Errorf("expected %q, got: %s", want, out)
			}
		})
	}
}

func TestRunMigrate_SkipsAlreadyApplied(t *testing.T) {
	dir := t.TempDir()
	writeMigration(t, dir, "001_init.sql", "SELECT 1;")
	writeMigration(t, dir, "002_add_col.sql", "SELECT 2;")

	out, err := applyToDir(t, newFakeDB("001_init.sql"), dir)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out, "Applied 1 migration(s)") {
		t.Errorf("expected 1 applied, got: %s", out)
	}
	if !strings.Contains(out, "skip  001_init.sql") {
		t.Errorf("expected skip message for 001_init.sql, got: %s", out)
	}
}

func TestRunMigrate_MissingDBName(t *testing.T) {
	_, err := newMigrator(&config.Config{}, newFakeDB(), &strings.Builder{})
	if err == nil || !strings.Contains(err.Error(), "db_name") {
		t.Errorf("expected db_name error, got: %v", err)
	}
}

func TestRunMigrate_RecordsEachMigration(t *testing.T) {
	dir := t.TempDir()
	writeMigration(t, dir, "001_a.sql", "SELECT 1;")
	writeMigration(t, dir, "002_b.sql", "SELECT 2;")

	db := newFakeDB()
	if _, err := applyToDir(t, db, dir); err != nil {
		t.Fatal(err)
	}
	insertCount := 0
	for _, call := range db.execCalls {
		if strings.Contains(call, "INSERT INTO schema_migrations") {
			insertCount++
		}
	}
	if insertCount != 2 {
		t.Errorf("expected 2 INSERT calls, got %d; calls: %v", insertCount, db.execCalls)
	}
}

// ---------------------------------------------------------------------------
// confirmDBInit tests
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// migrateAllDatabases tests
// ---------------------------------------------------------------------------

func testCfgWithDatabases(dbs ...string) *config.Config {
	cfg := migrateConfig()
	cfg.Build.Databases = dbs
	return cfg
}

func applyAllToDir(t *testing.T, db *fakeDB, cfg *config.Config, dir string) (string, error) {
	t.Helper()
	var out strings.Builder
	err := migrateAllDatabases(context.Background(), cfg, db, &out, dir)
	return out.String(), err
}

func TestMigrateAllDatabases_NoDatabasesConfigured(t *testing.T) {
	dir := t.TempDir()
	writeMigration(t, dir, "001_init.sql", "SELECT 1;")
	out, err := applyAllToDir(t, newFakeDB(), testCfgWithDatabases(), dir)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out, "No test databases") {
		t.Errorf("expected no-databases message, got: %s", out)
	}
}

func TestMigrateAllDatabases_AppliesEachDatabase(t *testing.T) {
	dir := t.TempDir()
	writeMigration(t, dir, "001_init.sql", "SELECT 1;")
	out, err := applyAllToDir(t, newFakeDB(), testCfgWithDatabases("testdb1", "testdb2"), dir)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out, "testdb1") {
		t.Errorf("expected testdb1 in output, got: %s", out)
	}
	if !strings.Contains(out, "testdb2") {
		t.Errorf("expected testdb2 in output, got: %s", out)
	}
	// Both databases receive the migration — "Applied 1" appears twice
	if count := strings.Count(out, "Applied 1 migration(s)"); count != 2 {
		t.Errorf("expected 2 'Applied 1' lines, got %d; output: %s", count, out)
	}
}

func TestMigrateAllDatabases_SkipsAlreadyApplied(t *testing.T) {
	dir := t.TempDir()
	writeMigration(t, dir, "001_init.sql", "SELECT 1;")
	db := newFakeDB("001_init.sql")
	out, err := applyAllToDir(t, db, testCfgWithDatabases("testdb1"), dir)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out, "Nothing to apply") {
		t.Errorf("expected nothing-to-apply, got: %s", out)
	}
}

func TestMigrateAllDatabases_RejectsProdDB(t *testing.T) {
	dir := t.TempDir()
	cfg := testCfgWithDatabases("masterdb") // same as providers.database.db_name
	_, err := applyAllToDir(t, newFakeDB(), cfg, dir)
	if err == nil || !strings.Contains(err.Error(), "production database") {
		t.Errorf("expected production-database guard error, got: %v", err)
	}
}

func TestMigrateAllDatabases_StopsOnFirstError(t *testing.T) {
	dir := t.TempDir()
	writeMigration(t, dir, "001_init.sql", "SELECT 1;")
	db := newFakeDB()
	db.fileErr = fmt.Errorf("psql connection refused")
	out, err := applyAllToDir(t, db, testCfgWithDatabases("testdb1", "testdb2"), dir)
	if err == nil {
		t.Errorf("expected error from fileErr, got nil; output: %s", out)
	}
	if strings.Contains(out, "testdb2") {
		t.Errorf("should stop after testdb1 failure, but testdb2 appeared in output: %s", out)
	}
}

// ---------------------------------------------------------------------------
// confirmDBInit tests
// ---------------------------------------------------------------------------

func TestConfirmDBInit_YesProceeds(t *testing.T) {
	var out strings.Builder
	ok := confirmDBInit(strings.NewReader("yes\n"), &out)
	if !ok {
		t.Error("expected confirmDBInit to return true for 'yes'")
	}
}

func TestConfirmDBInit_YesWithWhitespace(t *testing.T) {
	var out strings.Builder
	ok := confirmDBInit(strings.NewReader("  yes  \n"), &out)
	if !ok {
		t.Error("expected confirmDBInit to return true for '  yes  ' (trimmed)")
	}
}

func TestConfirmDBInit_NoAborts(t *testing.T) {
	var out strings.Builder
	ok := confirmDBInit(strings.NewReader("no\n"), &out)
	if ok {
		t.Error("expected confirmDBInit to return false for 'no'")
	}
	if !strings.Contains(out.String(), "Aborted") {
		t.Errorf("expected 'Aborted' in output, got: %q", out.String())
	}
}

func TestConfirmDBInit_EmptyInputAborts(t *testing.T) {
	var out strings.Builder
	ok := confirmDBInit(strings.NewReader("\n"), &out)
	if ok {
		t.Error("expected confirmDBInit to return false for empty input")
	}
}

func TestConfirmDBInit_EOFAborts(t *testing.T) {
	var out strings.Builder
	ok := confirmDBInit(strings.NewReader(""), &out)
	if ok {
		t.Error("expected confirmDBInit to return false on EOF (no input)")
	}
}

func TestConfirmDBInit_PrintsWarning(t *testing.T) {
	var out strings.Builder
	confirmDBInit(strings.NewReader("no\n"), &out)
	warning := out.String()
	if !strings.Contains(warning, "WARNING") {
		t.Errorf("expected WARNING in output, got: %q", warning)
	}
	if !strings.Contains(warning, "PRODUCTION") {
		t.Errorf("expected PRODUCTION in output, got: %q", warning)
	}
}
