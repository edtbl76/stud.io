package config

import (
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

// validProvidersYAML is a minimal valid providers block used as a base for
// health-check validation tests.
var validProvidersYAML = `
providers:
  container:
    type: docker
    compose_file: docker-compose.yml
  database:
    service: studio_db
    user: studio
`

// assertLoadError writes content to a temp roadie.yml, calls Load, and asserts
// that the error message contains wantErr.
func assertLoadError(t *testing.T, content, wantErr string) {
	t.Helper()
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "roadie.yml"), []byte(content), 0644); err != nil {
		t.Fatalf("writing temp config: %v", err)
	}
	_, err := Load(dir)
	if err == nil {
		t.Fatalf("expected validation error containing %q, got nil", wantErr)
	}
	if !strings.Contains(err.Error(), wantErr) {
		t.Fatalf("expected error containing %q, got: %v", wantErr, err)
	}
}

func TestLoad_ValidConfig(t *testing.T) {
	cfg, err := Load("testdata")
	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}

	if cfg.Providers.Container.Type != "docker" {
		t.Errorf("container type: got %q, want %q", cfg.Providers.Container.Type, "docker")
	}
	if cfg.Providers.Container.ComposeFile != "docker-compose.yml" {
		t.Errorf("compose_file: got %q, want %q", cfg.Providers.Container.ComposeFile, "docker-compose.yml")
	}
	if cfg.Providers.Database.Service != "studio_db" {
		t.Errorf("database service: got %q, want %q", cfg.Providers.Database.Service, "studio_db")
	}
	if cfg.Providers.Database.User != "studio" {
		t.Errorf("database user: got %q, want %q", cfg.Providers.Database.User, "studio")
	}
	if len(cfg.Stack.HealthChecks) != 2 {
		t.Errorf("health_checks: got %d, want 2", len(cfg.Stack.HealthChecks))
	}
	if len(cfg.Stack.DevHealthChecks) != 1 {
		t.Errorf("dev_health_checks: got %d, want 1", len(cfg.Stack.DevHealthChecks))
	}
}

func TestLoad_BuildConfig(t *testing.T) {
	cfg, err := Load("testdata")
	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}

	wantFiles := []string{"sql/schema.sql", "sql/views.sql"}
	if !slices.Equal(cfg.Build.SchemaFiles, wantFiles) {
		t.Errorf("schema_files: got %v, want %v", cfg.Build.SchemaFiles, wantFiles)
	}

	wantSeeds := []string{"sql/seeds/01_entity_types.sql"}
	if !slices.Equal(cfg.Build.SeedFiles, wantSeeds) {
		t.Errorf("seed_files: got %v, want %v", cfg.Build.SeedFiles, wantSeeds)
	}

	wantDBs := []string{"masterdb_test"}
	if !slices.Equal(cfg.Build.Databases, wantDBs) {
		t.Errorf("databases: got %v, want %v", cfg.Build.Databases, wantDBs)
	}

	wantRebuildOn := []string{"docker-compose.yml", "app/controlroom_backend/Dockerfile"}
	if !slices.Equal(cfg.Build.RebuildOn, wantRebuildOn) {
		t.Errorf("rebuild_on: got %v, want %v", cfg.Build.RebuildOn, wantRebuildOn)
	}

	if cfg.Providers.Database.DBName != "masterdb" {
		t.Errorf("db_name: got %q, want %q", cfg.Providers.Database.DBName, "masterdb")
	}
}

func TestLoad_BuildConfig_EmptyIsValid(t *testing.T) {
	dir := t.TempDir()
	content := validProvidersYAML // no build: section
	if err := os.WriteFile(filepath.Join(dir, "roadie.yml"), []byte(content), 0644); err != nil {
		t.Fatalf("writing temp config: %v", err)
	}
	cfg, err := Load(dir)
	if err != nil {
		t.Fatalf("expected no error for config without build: section, got: %v", err)
	}
	if len(cfg.Build.SchemaFiles) != 0 {
		t.Errorf("expected empty schema_files, got %v", cfg.Build.SchemaFiles)
	}
	if len(cfg.Build.Databases) != 0 {
		t.Errorf("expected empty databases, got %v", cfg.Build.Databases)
	}
}

func TestLoad_FileNotFound(t *testing.T) {
	_, err := Load("/nonexistent/path")
	if err == nil {
		t.Fatal("expected error for missing file, got nil")
	}
}

func TestLoad_MalformedYAML(t *testing.T) {
	dir := t.TempDir()
	content := "providers:\n  container:\n    type: [this is not valid yaml\n"
	if err := os.WriteFile(filepath.Join(dir, "roadie.yml"), []byte(content), 0644); err != nil {
		t.Fatalf("writing temp config: %v", err)
	}
	_, err := Load(dir)
	if err == nil {
		t.Fatal("expected error for malformed YAML, got nil")
	}
}

func TestLoad_HealthCheckValidationErrors(t *testing.T) {
	tests := []struct {
		name    string
		extra   string
		wantErr string
	}{
		{
			name:    "missing type",
			extra:   "\nstack:\n  health_checks:\n    - name: Unnamed\n",
			wantErr: "missing type",
		},
		{
			name:    "http missing url",
			extra:   "\nstack:\n  health_checks:\n    - name: API\n      type: http\n",
			wantErr: "http check missing url",
		},
		{
			name:    "http invalid url",
			extra:   "\nstack:\n  health_checks:\n    - name: API\n      type: http\n      url: \"not a url\"\n",
			wantErr: "invalid url",
		},
		{
			name:    "database missing user",
			extra:   "\nstack:\n  health_checks:\n    - name: DB\n      type: database\n",
			wantErr: "database check missing user",
		},
		{
			name:    "unknown type",
			extra:   "\nstack:\n  health_checks:\n    - name: Weird\n      type: grpc\n",
			wantErr: "unknown type",
		},
		{
			name:    "dev_health_checks validated",
			extra:   "\nstack:\n  dev_health_checks:\n    - name: Tool\n      type: http\n",
			wantErr: "http check missing url",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assertLoadError(t, validProvidersYAML+tt.extra, tt.wantErr)
		})
	}
}

// validProvidersWithProdDB is like validProvidersYAML but includes db_name.
var validProvidersWithProdDB = `
providers:
  container:
    type: docker
    compose_file: docker-compose.yml
  database:
    service: studio_db
    user: studio
    db_name: masterdb
`

func TestLoad_BuildDatabases_ProdNameRejected(t *testing.T) {
	// The production db_name must never appear in build.databases.
	content := validProvidersWithProdDB + `
build:
  databases:
    - masterdb_test
    - masterdb
`
	assertLoadError(t, content, "build.databases must not contain the production database")
}

func TestLoad_BuildDatabases_ValidCases(t *testing.T) {
	tests := []struct {
		name    string
		content string
	}{
		{
			name:    "test-only names pass when db_name is set",
			content: validProvidersWithProdDB + "\nbuild:\n  databases:\n    - masterdb_test\n",
		},
		{
			name:    "any name passes when db_name is not set",
			content: validProvidersYAML + "\nbuild:\n  databases:\n    - anything\n",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			dir := t.TempDir()
			if err := os.WriteFile(filepath.Join(dir, "roadie.yml"), []byte(tt.content), 0644); err != nil {
				t.Fatalf("writing temp config: %v", err)
			}
			if _, err := Load(dir); err != nil {
				t.Fatalf("expected no error, got: %v", err)
			}
		})
	}
}

func TestLoad_TestConfig_E2E(t *testing.T) {
	cfg, err := Load("testdata")
	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}

	if cfg.Test.E2E.Shards != 4 {
		t.Errorf("e2e.shards: got %d, want 4", cfg.Test.E2E.Shards)
	}
	if cfg.Test.E2E.BackendService != "controlroom_backend_test" {
		t.Errorf("e2e.backend_service: got %q, want controlroom_backend_test", cfg.Test.E2E.BackendService)
	}
	if cfg.Test.E2E.BackendBasePort != 5151 {
		t.Errorf("e2e.backend_base_port: got %d, want 5151", cfg.Test.E2E.BackendBasePort)
	}
	if cfg.Test.E2E.FrontendBasePort != 3001 {
		t.Errorf("e2e.frontend_base_port: got %d, want 3001", cfg.Test.E2E.FrontendBasePort)
	}
}

func TestLoad_TestConfig_Perf(t *testing.T) {
	cfg, err := Load("testdata")
	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}

	if cfg.Test.Perf.BackendPort != 5160 {
		t.Errorf("perf.backend_port: got %d, want 5160", cfg.Test.Perf.BackendPort)
	}
	if cfg.Test.Perf.FrontendPort != 3010 {
		t.Errorf("perf.frontend_port: got %d, want 3010", cfg.Test.Perf.FrontendPort)
	}
}

func TestLoad_TestConfig_DB(t *testing.T) {
	cfg, err := Load("testdata")
	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}

	if cfg.Test.DB.Container != "studio_db" {
		t.Errorf("db.container: got %q, want studio_db", cfg.Test.DB.Container)
	}
	if cfg.Test.DB.Source != "masterdb_test" {
		t.Errorf("db.source: got %q, want masterdb_test", cfg.Test.DB.Source)
	}
}

func TestLoad_EnvOverrides(t *testing.T) {
	t.Setenv("ROADIE_TEST_DB_SOURCE", "masterdb_test_ci")
	t.Setenv("ROADIE_BUILD_DATABASES", "masterdb_test_ci")
	cfg, err := Load("testdata")
	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}
	if cfg.Test.DB.Source != "masterdb_test_ci" {
		t.Errorf("db.source: got %q, want masterdb_test_ci", cfg.Test.DB.Source)
	}
	if len(cfg.Build.Databases) != 1 || cfg.Build.Databases[0] != "masterdb_test_ci" {
		t.Errorf("build.databases: got %v, want [masterdb_test_ci]", cfg.Build.Databases)
	}
}

func TestLoad_EnvOverride_ProdDBRejected(t *testing.T) {
	t.Setenv("ROADIE_BUILD_DATABASES", "masterdb")
	_, err := Load("testdata")
	if err == nil {
		t.Fatal("expected validation error when env override sets prod DB in build.databases, got nil")
	}
	if !strings.Contains(err.Error(), "build.databases must not contain the production database") {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestLoad_TestConfig_EmptyIsValid(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "roadie.yml"), []byte(validProvidersYAML), 0644); err != nil {
		t.Fatalf("writing temp config: %v", err)
	}
	cfg, err := Load(dir)
	if err != nil {
		t.Fatalf("expected no error for config without test: section, got: %v", err)
	}
	if cfg.Test.E2E.Shards != 0 {
		t.Errorf("expected zero shards when test: not configured, got %d", cfg.Test.E2E.Shards)
	}
}

func TestLoad_ValidationErrors(t *testing.T) {
	tests := []struct {
		name    string
		content string
		wantErr string
	}{
		{
			name: "missing compose_file",
			content: `
providers:
  container:
    type: docker
  database:
    service: studio_db
    user: studio
`,
			wantErr: "compose_file",
		},
		{
			name: "missing database service",
			content: `
providers:
  container:
    type: docker
    compose_file: docker-compose.yml
  database:
    user: studio
`,
			wantErr: "service",
		},
		{
			name: "missing database user",
			content: `
providers:
  container:
    type: docker
    compose_file: docker-compose.yml
  database:
    service: studio_db
`,
			wantErr: "user",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assertLoadError(t, tt.content, tt.wantErr)
		})
	}
}
