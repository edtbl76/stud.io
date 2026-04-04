package providers

import (
	"context"
	"errors"
	"io"
	"testing"
)

func newTestPostgres(fake *fakeRunner) *PostgresProvider {
	p := NewPostgresProvider("docker-compose.yml", nil)
	p.run = fake
	return p
}

func TestPostgresProvider_IsReady_True(t *testing.T) {
	fake := &fakeRunner{runFn: func(_ context.Context, _, _ io.Writer, _ string, _ ...string) error {
		return nil
	}}
	ok, err := newTestPostgres(fake).IsReady(context.Background(), DBConfig{Service: "db", User: "studio"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !ok {
		t.Error("expected IsReady=true when command succeeds")
	}
}

func TestPostgresProvider_IsReady_False(t *testing.T) {
	fake := &fakeRunner{runFn: func(_ context.Context, _, _ io.Writer, _ string, _ ...string) error {
		return errors.New("exit status 1")
	}}
	ok, err := newTestPostgres(fake).IsReady(context.Background(), DBConfig{Service: "db", User: "studio"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ok {
		t.Error("expected IsReady=false when command fails")
	}
}
