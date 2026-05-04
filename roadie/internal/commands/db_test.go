package commands

import (
	"context"
	"os"
	"path/filepath"
	"strings"
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
	f.execCalls = append(f.execCalls, sql)
	return f.execErr
}
func (f *fakeDB) ExecSQLFile(_ context.Context, _ providers.DBConfig, path string) error {
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

func applyToDir(t *testing.T, cfg *config.Config, db *fakeDB, out *strings.Builder, dir string) error {
	t.Helper()
	m, err := newMigrator(cfg, db, out)
	if err != nil {
		return err
	}
	return m.apply(context.Background(), dir)
}

func TestRunMigrate_AppliesNewMigrations(t *testing.T) {
	dir := t.TempDir()
	writeMigration(t, dir, "001_init.sql", "SELECT 1;")
	writeMigration(t, dir, "002_add_col.sql", "SELECT 2;")

	db := newFakeDB()
	var out strings.Builder
	if err := applyToDir(t, migrateConfig(), db, &out, dir); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out.String(), "Applied 2 migration(s)") {
		t.Errorf("expected 2 applied, got: %s", out.String())
	}
}

func TestRunMigrate_SkipsAlreadyApplied(t *testing.T) {
	dir := t.TempDir()
	writeMigration(t, dir, "001_init.sql", "SELECT 1;")
	writeMigration(t, dir, "002_add_col.sql", "SELECT 2;")

	db := newFakeDB("001_init.sql")
	var out strings.Builder
	if err := applyToDir(t, migrateConfig(), db, &out, dir); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out.String(), "Applied 1 migration(s)") {
		t.Errorf("expected 1 applied, got: %s", out.String())
	}
	if !strings.Contains(out.String(), "skip  001_init.sql") {
		t.Errorf("expected skip message for 001_init.sql, got: %s", out.String())
	}
}

func TestRunMigrate_NothingToApply(t *testing.T) {
	dir := t.TempDir()
	writeMigration(t, dir, "001_init.sql", "SELECT 1;")

	db := newFakeDB("001_init.sql")
	var out strings.Builder
	if err := applyToDir(t, migrateConfig(), db, &out, dir); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out.String(), "Nothing to apply") {
		t.Errorf("expected nothing-to-apply message, got: %s", out.String())
	}
}

func TestRunMigrate_EmptyDir(t *testing.T) {
	dir := t.TempDir()
	db := newFakeDB()
	var out strings.Builder
	if err := applyToDir(t, migrateConfig(), db, &out, dir); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out.String(), "Nothing to apply") {
		t.Errorf("expected nothing-to-apply for empty dir, got: %s", out.String())
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
	if err := applyToDir(t, migrateConfig(), db, &strings.Builder{}, dir); err != nil {
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

func TestRunMigrate_IgnoresNonSQLFiles(t *testing.T) {
	dir := t.TempDir()
	writeMigration(t, dir, "001_init.sql", "SELECT 1;")
	os.WriteFile(filepath.Join(dir, "README.md"), []byte("docs"), 0644) //nolint:errcheck

	db := newFakeDB()
	var out strings.Builder
	if err := applyToDir(t, migrateConfig(), db, &out, dir); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out.String(), "Applied 1 migration(s)") {
		t.Errorf("expected 1 applied (README ignored), got: %s", out.String())
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
