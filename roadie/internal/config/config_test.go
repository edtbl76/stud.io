package config

import (
	"os"
	"path/filepath"
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
