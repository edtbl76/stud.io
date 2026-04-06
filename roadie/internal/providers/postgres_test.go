package providers

import (
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
	"slices"
	"testing"
)

func newTestPostgres(fake *fakeRunner) *PostgresProvider {
	p := NewPostgresProvider("docker-compose.yml", nil)
	p.run = fake
	return p
}

func TestPostgresProvider_IsReady(t *testing.T) {
	tests := []struct {
		name    string
		runErr  error
		want    bool
		wantErr bool
	}{
		{"succeeds when command exits 0", nil, true, false},
		{"surfaces error when command exits non-zero", errors.New("exit status 1"), false, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			fake := &fakeRunner{runFn: func(_ context.Context, _ io.Writer, _ string, _ ...string) error {
				return tt.runErr
			}}
			ok, err := newTestPostgres(fake).IsReady(context.Background(), DBConfig{Service: "studio_db", User: "studio"})
			if (err != nil) != tt.wantErr {
				t.Fatalf("IsReady error = %v, wantErr %v", err, tt.wantErr)
			}
			if ok != tt.want {
				t.Errorf("IsReady = %v, want %v", ok, tt.want)
			}
		})
	}
}

func TestPostgresProvider_ExecSQL(t *testing.T) {
	t.Run("includes -d flag when DBName is set", func(t *testing.T) {
		var gotArgs []string
		fake := &fakeRunner{runFn: func(_ context.Context, _ io.Writer, _ string, args ...string) error {
			gotArgs = args
			return nil
		}}
		if err := newTestPostgres(fake).ExecSQL(context.Background(), DBConfig{Service: "studio_db", User: "studio", DBName: "studiodb"}, "SELECT 1"); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !slices.Contains(gotArgs, "-d") {
			t.Errorf("expected -d flag in args, got %v", gotArgs)
		}
	})

	t.Run("omits -d flag when DBName is empty", func(t *testing.T) {
		var gotArgs []string
		fake := &fakeRunner{runFn: func(_ context.Context, _ io.Writer, _ string, args ...string) error {
			gotArgs = args
			return nil
		}}
		if err := newTestPostgres(fake).ExecSQL(context.Background(), DBConfig{Service: "studio_db", User: "studio"}, "SELECT 1"); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if slices.Contains(gotArgs, "-d") {
			t.Errorf("expected no -d flag in args, got %v", gotArgs)
		}
	})

	t.Run("surfaces error when command fails", func(t *testing.T) {
		fake := &fakeRunner{runFn: func(_ context.Context, _ io.Writer, _ string, _ ...string) error {
			return errors.New("exit status 1")
		}}
		if err := newTestPostgres(fake).ExecSQL(context.Background(), DBConfig{Service: "studio_db", User: "studio"}, "SELECT 1"); err == nil {
			t.Error("expected error, got nil")
		}
	})
}

func tempSQLFile(t *testing.T) string {
	t.Helper()
	f := filepath.Join(t.TempDir(), "schema.sql")
	os.WriteFile(f, []byte("SELECT 1;"), 0o644)
	return f
}

func TestPostgresProvider_ExecSQLFile_PipesViaStdin(t *testing.T) {
	var gotArgs []string
	var gotStdin io.Reader
	fake := &fakeRunner{runWithStdinFn: func(_ context.Context, stdin io.Reader, _ io.Writer, _ string, args ...string) error {
		gotArgs = args
		gotStdin = stdin
		return nil
	}}
	if err := newTestPostgres(fake).ExecSQLFile(context.Background(), DBConfig{Service: "studio_db", User: "studio", DBName: "controlroomdb"}, tempSQLFile(t)); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !slices.Contains(gotArgs, "-f") || !slices.Contains(gotArgs, "-") {
		t.Errorf("expected -f - in args, got %v", gotArgs)
	}
	if gotStdin == nil {
		t.Error("expected stdin to be set, got nil")
	}
}

func TestPostgresProvider_ExecSQLFile_IncludesDBFlag(t *testing.T) {
	var gotArgs []string
	fake := &fakeRunner{runWithStdinFn: func(_ context.Context, _ io.Reader, _ io.Writer, _ string, args ...string) error {
		gotArgs = args
		return nil
	}}
	newTestPostgres(fake).ExecSQLFile(context.Background(), DBConfig{Service: "studio_db", User: "studio", DBName: "testdb"}, tempSQLFile(t))
	if !slices.Contains(gotArgs, "-d") {
		t.Errorf("expected -d flag in args, got %v", gotArgs)
	}
}

func TestPostgresProvider_ExecSQLFile_OmitsDBFlagWhenEmpty(t *testing.T) {
	var gotArgs []string
	fake := &fakeRunner{runWithStdinFn: func(_ context.Context, _ io.Reader, _ io.Writer, _ string, args ...string) error {
		gotArgs = args
		return nil
	}}
	newTestPostgres(fake).ExecSQLFile(context.Background(), DBConfig{Service: "studio_db", User: "studio"}, tempSQLFile(t))
	if slices.Contains(gotArgs, "-d") {
		t.Errorf("expected no -d flag in args, got %v", gotArgs)
	}
}

func TestPostgresProvider_ExecSQLFile_MissingFile(t *testing.T) {
	if err := newTestPostgres(&fakeRunner{}).ExecSQLFile(context.Background(), DBConfig{Service: "studio_db", User: "studio"}, "/nonexistent/schema.sql"); err == nil {
		t.Error("expected error for missing file, got nil")
	}
}

func TestPostgresProvider_ExecSQLFile_PsqlError(t *testing.T) {
	fake := &fakeRunner{runWithStdinFn: func(_ context.Context, _ io.Reader, _ io.Writer, _ string, _ ...string) error {
		return errors.New("exit status 1")
	}}
	if err := newTestPostgres(fake).ExecSQLFile(context.Background(), DBConfig{Service: "studio_db", User: "studio"}, tempSQLFile(t)); err == nil {
		t.Error("expected error, got nil")
	}
}
