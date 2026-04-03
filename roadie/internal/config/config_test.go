package config

import (
	"os"
	"path/filepath"
	"testing"
)

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
			dir := t.TempDir()
			if err := os.WriteFile(filepath.Join(dir, "roadie.yml"), []byte(tt.content), 0644); err != nil {
				t.Fatalf("writing temp config: %v", err)
			}
			_, err := Load(dir)
			if err == nil {
				t.Fatalf("expected validation error containing %q, got nil", tt.wantErr)
			}
		})
	}
}
