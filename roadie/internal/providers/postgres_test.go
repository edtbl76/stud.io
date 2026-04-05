package providers

import (
	"context"
	"errors"
	"io"
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
