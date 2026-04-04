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

func TestPostgresProvider_IsReady(t *testing.T) {
	tests := []struct {
		name   string
		runErr error
		want   bool
	}{
		{"succeeds when command exits 0", nil, true},
		{"fails when command exits non-zero", errors.New("exit status 1"), false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			fake := &fakeRunner{runFn: func(_ context.Context, _ io.Writer, _ string, _ ...string) error {
				return tt.runErr
			}}
			ok, err := newTestPostgres(fake).IsReady(context.Background(), DBConfig{Service: "db", User: "studio"})
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if ok != tt.want {
				t.Errorf("IsReady = %v, want %v", ok, tt.want)
			}
		})
	}
}
