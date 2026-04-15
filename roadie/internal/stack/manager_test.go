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
	upErr          error
	downErr        error
	upCalls        int
	removedNames   []string
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
func (m *mockContainer) RemoveContainers(_ context.Context, names []string) error {
	m.removedNames = append(m.removedNames, names...)
	return nil
}

type mockDB struct {
	ready    bool
	checkErr error
}

func (m *mockDB) IsReady(_ context.Context, _ providers.DBConfig) (bool, error) {
	return m.ready, m.checkErr
}
func (m *mockDB) ExecSQL(_ context.Context, _ providers.DBConfig, _ string) error     { return nil }
func (m *mockDB) ExecSQLFile(_ context.Context, _ providers.DBConfig, _ string) error { return nil }

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

func fastManager(container providers.ContainerProvider, db providers.SQLDatabaseProvider, http providers.HTTPHealthChecker) *Manager {
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
	assertUpError(t, func(m *Manager) error {
		return m.Start(context.Background(), testConfig(), false)
	})
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

	m := NewManager(container, db, &mockHTTP{}, &strings.Builder{})
	m.checkTimeout = 150 * time.Millisecond
	m.checkInterval = 10 * time.Millisecond

	err := m.Start(context.Background(), testConfig(), false)
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "studio_db") {
		t.Errorf("expected error to contain 'studio_db', got: %v", err)
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

func TestManager_Start_DBCheck_UserFallback(t *testing.T) {
	cfg := testConfig()
	cfg.Providers.Database.User = "fallback_user"
	cfg.Stack.HealthChecks = []config.HealthCheck{
		{Name: "DB", Type: "database"}, // User intentionally empty
	}

	var gotCfg providers.DBConfig
	db := &capturingDB{}
	db.fn = func(c providers.DBConfig) { gotCfg = c }

	if err := fastManager(&mockContainer{}, db, &mockHTTP{}).Start(context.Background(), cfg, false); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if gotCfg.User != "fallback_user" {
		t.Errorf("expected User=%q, got %q", "fallback_user", gotCfg.User)
	}
}

type capturingDB struct {
	fn func(providers.DBConfig)
}

func (c *capturingDB) IsReady(_ context.Context, cfg providers.DBConfig) (bool, error) {
	if c.fn != nil {
		c.fn(cfg)
	}
	return true, nil
}

func (c *capturingDB) ExecSQL(_ context.Context, _ providers.DBConfig, _ string) error { return nil }
func (c *capturingDB) ExecSQLFile(_ context.Context, _ providers.DBConfig, _ string) error {
	return nil
}

// assertUpError verifies that fn returns an error containing "compose failed".
func assertUpError(t *testing.T, fn func(*Manager) error) {
	t.Helper()
	container := &mockContainer{upErr: errors.New("compose failed")}
	err := fn(fastManager(container, &mockDB{}, &mockHTTP{}))
	if err == nil {
		t.Fatal("expected error from Up, got nil")
	}
	if !strings.Contains(err.Error(), "compose failed") {
		t.Errorf("expected error to contain 'compose failed', got: %v", err)
	}
}

// captureUpConfig runs fn against a capturing manager and returns the UpConfig
// that was passed to the container provider.
func captureUpConfig(t *testing.T, fn func(*Manager) error) providers.UpConfig {
	t.Helper()
	var gotCfg providers.UpConfig
	container := &capturingContainer{fn: func(c providers.UpConfig) { gotCfg = c }}
	if err := fn(fastManager(container, &mockDB{ready: true}, &mockHTTP{})); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	return gotCfg
}

// ── Manager.Build ─────────────────────────────────────────────────────────────

func TestManager_Build_Success(t *testing.T) {
	gotCfg := captureUpConfig(t, func(m *Manager) error {
		return m.Build(context.Background(), testConfig(), false)
	})
	if !gotCfg.Build {
		t.Error("expected Build=true in UpConfig, got false")
	}
	if !gotCfg.ForceRecreate {
		t.Error("expected ForceRecreate=true in UpConfig, got false")
	}
}

func TestManager_Build_UpError(t *testing.T) {
	assertUpError(t, func(m *Manager) error {
		return m.Build(context.Background(), testConfig(), false)
	})
}

func TestManager_Build_SetsDevFlag(t *testing.T) {
	gotCfg := captureUpConfig(t, func(m *Manager) error {
		return m.Build(context.Background(), testConfig(), true)
	})
	if !gotCfg.WithDev {
		t.Error("expected WithDev=true in UpConfig, got false")
	}
}

func TestManager_Start_DoesNotSetBuildFlags(t *testing.T) {
	gotCfg := captureUpConfig(t, func(m *Manager) error {
		return m.Start(context.Background(), testConfig(), false)
	})
	if gotCfg.Build {
		t.Error("Start must not set Build=true — only Build() should rebuild images")
	}
	if gotCfg.ForceRecreate {
		t.Error("Start must not set ForceRecreate=true")
	}
}

// capturingContainer records the UpConfig passed to Up.
type capturingContainer struct {
	fn func(providers.UpConfig)
}

func (c *capturingContainer) Up(_ context.Context, cfg providers.UpConfig) error {
	if c.fn != nil {
		c.fn(cfg)
	}
	return nil
}
func (c *capturingContainer) Down(_ context.Context, _ providers.DownConfig) error { return nil }
func (c *capturingContainer) IsRunning(_ context.Context, _ string) (bool, error)  { return false, nil }
func (c *capturingContainer) Status(_ context.Context) ([]providers.ServiceStatus, error) {
	return nil, nil
}
func (c *capturingContainer) Exec(_ context.Context, _ string, _ []string) error { return nil }
func (c *capturingContainer) RemoveContainers(_ context.Context, _ []string) error { return nil }

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

// ── Manager.Stop test container pruning ───────────────────────────────────────

func testConfigWithE2E(shards int, service string) *config.Config {
	cfg := testConfig()
	cfg.Test.E2E.BackendService = service
	cfg.Test.E2E.Shards = shards
	return cfg
}

func TestManager_Stop_PrunesTestContainers(t *testing.T) {
	container := &mockContainer{}
	m := NewManager(container, &mockDB{}, &mockHTTP{}, io.Discard)

	cfg := testConfigWithE2E(2, "controlroom_backend_test")
	if err := m.Stop(context.Background(), cfg, false); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	want := []string{"controlroom_backend_test_0", "controlroom_backend_test_1"}
	if len(container.removedNames) != len(want) {
		t.Fatalf("expected %d removed containers, got %d: %v", len(want), len(container.removedNames), container.removedNames)
	}
	for i, name := range want {
		if container.removedNames[i] != name {
			t.Errorf("removed[%d]: want %q, got %q", i, name, container.removedNames[i])
		}
	}
}

func TestManager_Stop_SkipsPruneWhenNoE2EConfig(t *testing.T) {
	container := &mockContainer{}
	m := NewManager(container, &mockDB{}, &mockHTTP{}, io.Discard)

	// testConfig() has no E2E settings — pruning should be a no-op.
	if err := m.Stop(context.Background(), testConfig(), false); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(container.removedNames) != 0 {
		t.Errorf("expected no containers removed, got: %v", container.removedNames)
	}
}
