package providers

import (
	"context"
	"io"
	"slices"
	"testing"
)

func newTestDocker(fake *fakeRunner) *DockerProvider {
	dp := NewDockerProvider("docker-compose.yml", "docker-compose.dev.yml", nil, io.Discard)
	dp.run = fake
	return dp
}

func TestDockerProvider_Up_Production(t *testing.T) {
	var got []string
	fake := &fakeRunner{runFn: func(_ context.Context, _, _ io.Writer, name string, args ...string) error {
		got = append([]string{name}, args...)
		return nil
	}}
	if err := newTestDocker(fake).Up(context.Background(), UpConfig{}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	for _, want := range []string{"compose", "-f", "docker-compose.yml", "up", "-d", "--remove-orphans"} {
		if !slices.Contains(got, want) {
			t.Errorf("expected %q in args %v", want, got)
		}
	}
	if slices.Contains(got, "docker-compose.dev.yml") {
		t.Errorf("dev compose file should not be present without --dev")
	}
}

func TestDockerProvider_Up_WithDev(t *testing.T) {
	var calls [][]string
	fake := &fakeRunner{runFn: func(_ context.Context, _, _ io.Writer, name string, args ...string) error {
		calls = append(calls, append([]string{name}, args...))
		return nil
	}}
	if err := newTestDocker(fake).Up(context.Background(), UpConfig{WithDev: true}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(calls) != 2 {
		t.Fatalf("expected 2 docker calls (prod + dev), got %d: %v", len(calls), calls)
	}
	// Second call must use the dev compose file and -p dev project flag.
	devCall := calls[1]
	for _, want := range []string{"docker-compose.dev.yml", "-p", "dev"} {
		if !slices.Contains(devCall, want) {
			t.Errorf("dev call: expected %q in args %v", want, devCall)
		}
	}
	if slices.Contains(calls[0], "docker-compose.dev.yml") {
		t.Errorf("prod call should not include dev compose file: %v", calls[0])
	}
}

func TestDockerProvider_Down(t *testing.T) {
	var got []string
	fake := &fakeRunner{runFn: func(_ context.Context, _, _ io.Writer, name string, args ...string) error {
		got = append([]string{name}, args...)
		return nil
	}}
	if err := newTestDocker(fake).Down(context.Background(), DownConfig{}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !slices.Contains(got, "down") {
		t.Errorf("expected 'down' in args %v", got)
	}
}

func TestDockerProvider_Down_WithDev(t *testing.T) {
	var calls [][]string
	fake := &fakeRunner{runFn: func(_ context.Context, _, _ io.Writer, name string, args ...string) error {
		calls = append(calls, append([]string{name}, args...))
		return nil
	}}
	if err := newTestDocker(fake).Down(context.Background(), DownConfig{WithDev: true}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(calls) != 2 {
		t.Fatalf("expected 2 docker calls (dev down + prod down), got %d: %v", len(calls), calls)
	}
	// First call must tear down the dev project.
	devCall := calls[0]
	for _, want := range []string{"docker-compose.dev.yml", "-p", "dev", "down"} {
		if !slices.Contains(devCall, want) {
			t.Errorf("dev down call: expected %q in args %v", want, devCall)
		}
	}
}

func TestDockerProvider_IsRunning_True(t *testing.T) {
	fake := &fakeRunner{outputFn: func(_ context.Context, _ string, _ ...string) ([]byte, error) {
		return []byte("abc123\n"), nil
	}}
	ok, err := newTestDocker(fake).IsRunning(context.Background(), "web")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !ok {
		t.Error("expected IsRunning=true for non-empty output")
	}
}

func TestDockerProvider_IsRunning_False(t *testing.T) {
	fake := &fakeRunner{outputFn: func(_ context.Context, _ string, _ ...string) ([]byte, error) {
		return []byte(""), nil
	}}
	ok, err := newTestDocker(fake).IsRunning(context.Background(), "web")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ok {
		t.Error("expected IsRunning=false for empty output")
	}
}
