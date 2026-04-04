package stack

import (
	"context"
	"errors"
	"io"
	"strings"
	"testing"
	"time"

	"github.com/studiocontrolroom/roadie/internal/config"
	"github.com/studiocontrolroom/roadie/internal/providers"
)

// ── Mock providers ───────────────────────────────────────────────────────────

type mockContainer struct {
	upErr   error
	downErr error
	upCalls int
}

func (m *mockContainer) Up(_ context.Context, _ providers.UpConfig) error {
	m.upCalls++
	return m.upErr
}

func (m *mockContainer) Down(_ context.Context, _ providers.DownConfig) error { return m.downErr }
func (m *mockContainer) IsRunning(_ context.Context, _ string) (bool, error)  { return false, nil }
func (m *mockContainer) Status(_ context.Context) ([]providers.ServiceStatus, error) {
	return nil, nil
}
func (m *mockContainer) Exec(_ context.Context, _ string, _ []string) error { return nil }

type mockDB struct {
	ready    bool
	checkErr error
}

func (m *mockDB) IsReady(_ context.Context, _ providers.DBConfig) (bool, error) {
	return m.ready, m.checkErr
}
func (m *mockDB) ExecSQL(_ context.Context, _ providers.DBConfig, _ string) error { return nil }

type mockHTTP struct {
	reachable bool
	checkErr  error
}

func (m *mockHTTP) IsReachable(_ context.Context, _ string) (bool, error) {
	return m.reachable, m.checkErr
}

// ── Helpers ──────────────────────────────────────────────────────────────────

func testConfig() *config.Config {
	return &config.Config{
		Providers: config.ProvidersConfig{
			Container: config.ContainerProviderConfig{
				ComposeFile: "docker-compose.yml",
			},
			Database: config.DatabaseProviderConfig{
				Service: "studio_db",
				User:    "studio",
			},
		},
		Stack: config.StackConfig{
			HealthChecks: []config.HealthCheck{
				{Name: "DB", Type: "database", User: "studio"},
			},
		},
	}
}

func fastManager(container *mockContainer, db *mockDB, http *mockHTTP) *Manager {
	m := NewManager(container, db, http, io.Discard)
	m.checkTimeout = 200 * time.Millisecond
	m.checkInterval = 10 * time.Millisecond
	return m
}

// ── Tests ─────────────────────────────────────────────────────────────────────

func TestManager_Start_Success(t *testing.T) {
	container := &mockContainer{}
	db := &mockDB{ready: true}
	http := &mockHTTP{}

	if err := fastManager(container, db, http).Start(context.Background(), testConfig(), false); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if container.upCalls != 1 {
		t.Errorf("expected Up called once, got %d", container.upCalls)
	}
}

func TestManager_Start_UpError(t *testing.T) {
	container := &mockContainer{upErr: errors.New("compose failed")}
	err := fastManager(container, &mockDB{}, &mockHTTP{}).Start(context.Background(), testConfig(), false)
	if err == nil {
		t.Fatal("expected error from Up, got nil")
	}
	if !strings.Contains(err.Error(), "compose failed") {
		t.Errorf("expected error to contain 'compose failed', got: %v", err)
	}
}

func TestManager_Start_HealthCheckTimeout(t *testing.T) {
	container := &mockContainer{}
	db := &mockDB{ready: false} // never becomes ready

	ctx, cancel := context.WithTimeout(context.Background(), 150*time.Millisecond)
	defer cancel()

	err := fastManager(container, db, &mockHTTP{}).Start(ctx, testConfig(), false)
	if err == nil {
		t.Fatal("expected timeout error, got nil")
	}
}

func TestManager_Start_HealthCheckError_SurfacedInTimeout(t *testing.T) {
	container := &mockContainer{}
	db := &mockDB{ready: false, checkErr: errors.New("service 'studio_db' not running")}

	ctx, cancel := context.WithTimeout(context.Background(), 150*time.Millisecond)
	defer cancel()

	var buf strings.Builder
	m := NewManager(container, db, &mockHTTP{}, &buf)
	m.checkTimeout = 200 * time.Millisecond
	m.checkInterval = 10 * time.Millisecond

	err := m.Start(ctx, testConfig(), false)
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(buf.String(), "studio_db") {
		t.Errorf("expected error message in output, got: %q", buf.String())
	}
}

func TestManager_Stop(t *testing.T) {
	var buf strings.Builder
	container := &mockContainer{}
	m := NewManager(container, &mockDB{}, &mockHTTP{}, &buf)

	if err := m.Stop(context.Background(), testConfig(), false); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(buf.String(), "Done") {
		t.Errorf("expected 'Done' in output, got: %q", buf.String())
	}
}

func TestManager_Start_WithDev_RunsDevChecks(t *testing.T) {
	cfg := testConfig()
	cfg.Stack.DevHealthChecks = []config.HealthCheck{
		{Name: "SonarQube", Type: "http", URL: "http://localhost:1969"},
	}

	httpChecks := 0
	httpMock := &mockHTTP{reachable: true}
	// Track http calls by using a real Manager with a counting HTTP checker
	_ = httpMock
	_ = httpChecks

	container := &mockContainer{}
	var buf strings.Builder
	m := NewManager(container, &mockDB{ready: true}, &mockHTTP{reachable: true}, &buf)
	m.checkTimeout = 200 * time.Millisecond
	m.checkInterval = 10 * time.Millisecond

	if err := m.Start(context.Background(), cfg, true); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(buf.String(), "SonarQube") {
		t.Errorf("expected dev check 'SonarQube' in output, got: %q", buf.String())
	}
}
