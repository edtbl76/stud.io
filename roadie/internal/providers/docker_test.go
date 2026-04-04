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

// captureRunCalls returns a fakeRunner and a pointer to the slice of captured
// invocations, where each entry is [name, arg1, arg2, ...].
func captureRunCalls() (*fakeRunner, *[][]string) {
	var calls [][]string
	fake := &fakeRunner{runFn: func(_ context.Context, _ io.Writer, name string, args ...string) error {
		calls = append(calls, append([]string{name}, args...))
		return nil
	}}
	return fake, &calls
}

func TestDockerProvider_Up_Production(t *testing.T) {
	fake, calls := captureRunCalls()
	if err := newTestDocker(fake).Up(context.Background(), UpConfig{}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(*calls) == 0 {
		t.Fatalf("expected at least 1 docker call, got 0")
	}
	got := (*calls)[0]
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
	fake, calls := captureRunCalls()
	if err := newTestDocker(fake).Up(context.Background(), UpConfig{WithDev: true}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(*calls) != 2 {
		t.Fatalf("expected 2 docker calls (prod + dev), got %d: %v", len(*calls), *calls)
	}
	devCall := (*calls)[1]
	for _, want := range []string{"docker-compose.dev.yml", "-p", "dev"} {
		if !slices.Contains(devCall, want) {
			t.Errorf("dev call: expected %q in args %v", want, devCall)
		}
	}
	if slices.Contains((*calls)[0], "docker-compose.dev.yml") {
		t.Errorf("prod call should not include dev compose file: %v", (*calls)[0])
	}
}

func TestDockerProvider_Down(t *testing.T) {
	fake, calls := captureRunCalls()
	if err := newTestDocker(fake).Down(context.Background(), DownConfig{}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(*calls) == 0 {
		t.Fatalf("expected at least 1 docker call, got 0")
	}
	if !slices.Contains((*calls)[0], "down") {
		t.Errorf("expected 'down' in args %v", (*calls)[0])
	}
}

func TestDockerProvider_Down_WithDev(t *testing.T) {
	fake, calls := captureRunCalls()
	if err := newTestDocker(fake).Down(context.Background(), DownConfig{WithDev: true}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(*calls) != 2 {
		t.Fatalf("expected 2 docker calls (dev down + prod down), got %d: %v", len(*calls), *calls)
	}
	devCall := (*calls)[0]
	for _, want := range []string{"docker-compose.dev.yml", "-p", "dev", "down"} {
		if !slices.Contains(devCall, want) {
			t.Errorf("dev down call: expected %q in args %v", want, devCall)
		}
	}
}

func TestDockerProvider_Up_Build(t *testing.T) {
	fake, calls := captureRunCalls()
	if err := newTestDocker(fake).Up(context.Background(), UpConfig{Build: true}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(*calls) == 0 {
		t.Fatalf("expected at least 1 docker call, got 0")
	}
	if !slices.Contains((*calls)[0], "--build") {
		t.Errorf("expected --build in args %v", (*calls)[0])
	}
}

func TestDockerProvider_Up_ForceRecreate(t *testing.T) {
	fake, calls := captureRunCalls()
	if err := newTestDocker(fake).Up(context.Background(), UpConfig{ForceRecreate: true}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(*calls) == 0 {
		t.Fatalf("expected at least 1 docker call, got 0")
	}
	if !slices.Contains((*calls)[0], "--force-recreate") {
		t.Errorf("expected --force-recreate in args %v", (*calls)[0])
	}
}

func TestDockerProvider_Up_WithDev_NoDevFile_Errors(t *testing.T) {
	dp := NewDockerProvider("docker-compose.yml", "", nil, io.Discard)
	fake, _ := captureRunCalls()
	dp.run = fake
	if err := dp.Up(context.Background(), UpConfig{WithDev: true}); err == nil {
		t.Error("expected error when WithDev=true but no dev compose file configured")
	}
}

func TestDockerProvider_Down_WithDev_NoDevFile_Errors(t *testing.T) {
	dp := NewDockerProvider("docker-compose.yml", "", nil, io.Discard)
	fake, _ := captureRunCalls()
	dp.run = fake
	if err := dp.Down(context.Background(), DownConfig{WithDev: true}); err == nil {
		t.Error("expected error when WithDev=true but no dev compose file configured")
	}
}

func TestDockerProvider_Exec_EmptyCmd_Errors(t *testing.T) {
	fake, _ := captureRunCalls()
	if err := newTestDocker(fake).Exec(context.Background(), "web", nil); err == nil {
		t.Error("expected error for empty cmd, got nil")
	}
}

func TestDockerProvider_IsRunning(t *testing.T) {
	tests := []struct {
		name   string
		output string
		want   bool
	}{
		{"non-empty output", "abc123\n", true},
		{"empty output", "", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			fake := &fakeRunner{outputFn: func(_ context.Context, _ string, _ ...string) ([]byte, error) {
				return []byte(tt.output), nil
			}}
			ok, err := newTestDocker(fake).IsRunning(context.Background(), "web")
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if ok != tt.want {
				t.Errorf("IsRunning = %v, want %v", ok, tt.want)
			}
		})
	}
}
