package config

import (
	"os"
	"path/filepath"
	"testing"
)

func writeTempConfig(t *testing.T, content string) string {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, ".plugin-scanner.yml")
	if err := os.WriteFile(path, []byte(content), 0600); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestApplyDefaults_EmptyConfig(t *testing.T) {
	cfg := &Config{}
	applyDefaults(cfg)

	if cfg.ServerURL != defaultServerURL {
		t.Errorf("ServerURL = %q, want %q", cfg.ServerURL, defaultServerURL)
	}
	if cfg.TimeoutSeconds != defaultTimeout {
		t.Errorf("TimeoutSeconds = %d, want %d", cfg.TimeoutSeconds, defaultTimeout)
	}
	if len(cfg.ScanPaths) != len(defaultScanPaths) {
		t.Errorf("ScanPaths len = %d, want %d", len(cfg.ScanPaths), len(defaultScanPaths))
	}
	if cfg.MachineName == "" {
		t.Error("MachineName should be set from os.Hostname()")
	}
}

func TestApplyDefaults_ExplicitScanPaths(t *testing.T) {
	cfg := &Config{ScanPaths: []string{"/custom/path"}}
	applyDefaults(cfg)
	if len(cfg.ScanPaths) != 1 || cfg.ScanPaths[0] != "/custom/path" {
		t.Errorf("explicit scan_paths should not be overridden, got %v", cfg.ScanPaths)
	}
}

func TestSave_RoundTrip(t *testing.T) {
	dir := t.TempDir()
	origHome := os.Getenv("HOME")
	os.Setenv("HOME", dir)
	defer os.Setenv("HOME", origHome)

	if err := Save("api_key", "test-key-1234"); err != nil {
		t.Fatal(err)
	}
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.APIKey != "test-key-1234" {
		t.Errorf("APIKey = %q, want %q", cfg.APIKey, "test-key-1234")
	}
}

func TestSave_ScanPathsRejected(t *testing.T) {
	if err := Save("scan_paths", "/some/path"); err == nil {
		t.Error("expected error saving scan_paths via config set")
	}
}

func TestResolveCA_SystemRoots_WhenMkcertAbsent(t *testing.T) {
	resolved, err := ResolveCA("")
	if err != nil {
		t.Fatal(err)
	}
	if resolved.Source != CASourceSystemRoots && resolved.Source != CASourceMkcertAuto {
		t.Errorf("unexpected source: %s", resolved.Source)
	}
	if resolved.TLSConfig == nil {
		t.Error("TLSConfig should not be nil")
	}
}

func TestResolveCA_ConfigOverride(t *testing.T) {
	// This test verifies error path when cert file is missing.
	_, err := ResolveCA("/nonexistent/path/ca.pem")
	if err == nil {
		t.Error("expected error for missing CA cert file")
	}
}

func TestCheckPerms_WarnOnLoosePerms(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.yml")
	if err := os.WriteFile(path, []byte(""), 0644); err != nil {
		t.Fatal(err)
	}
	if err := checkPerms(path); err == nil {
		t.Error("expected warning for 0644 permissions")
	}
}

func TestRedact(t *testing.T) {
	cases := []struct {
		key  string
		want string
	}{
		{"psc_abcdef1234", "**********1234"},
		{"ab", "**"},
		{"", ""},
	}
	for _, c := range cases {
		if got := Redact(c.key); got != c.want {
			t.Errorf("Redact(%q) = %q, want %q", c.key, got, c.want)
		}
	}
}

func TestExpandHome(t *testing.T) {
	home, _ := os.UserHomeDir()
	got := expandHome("~/Library/VST3")
	want := filepath.Join(home, "Library/VST3")
	if got != want {
		t.Errorf("expandHome = %q, want %q", got, want)
	}
}

func TestExpandHome_NoTilde(t *testing.T) {
	got := expandHome("/absolute/path")
	if got != "/absolute/path" {
		t.Errorf("expandHome should not modify absolute paths, got %q", got)
	}
}
