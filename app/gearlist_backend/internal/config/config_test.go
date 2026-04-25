package config

import (
	"strings"
	"testing"

	"pgregory.net/rapid"
)

func TestLoadDefaults(t *testing.T) {
	t.Setenv("DB_HOST", "")
	t.Setenv("DB_NAME", "")
	t.Setenv("DB_PASSWORD", "testpass")

	// defaults are non-empty so Load should succeed
	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() with defaults: %v", err)
	}
	if cfg.DBHost == "" {
		t.Error("expected non-empty DBHost from default")
	}
	if cfg.AppPort == 0 {
		t.Error("expected non-zero AppPort from default")
	}
}

func TestLoadReadsEnv(t *testing.T) {
	t.Setenv("DB_HOST", "myhost")
	t.Setenv("DB_NAME", "mydb")
	t.Setenv("DB_PASSWORD", "mypass")
	t.Setenv("APP_PORT", "9999")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load(): %v", err)
	}
	if cfg.DBHost != "myhost" {
		t.Errorf("DBHost = %q, want %q", cfg.DBHost, "myhost")
	}
	if cfg.DBName != "mydb" {
		t.Errorf("DBName = %q, want %q", cfg.DBName, "mydb")
	}
	if cfg.AppPort != 9999 {
		t.Errorf("AppPort = %d, want 9999", cfg.AppPort)
	}
}

func TestDSNAlwaysHasPostgresScheme(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		host := rapid.StringMatching(`[a-z]{1,20}`).Draw(t, "host")
		name := rapid.StringMatching(`[a-z]{1,20}`).Draw(t, "name")
		pass := rapid.StringMatching(`[!-~]{1,20}`).Draw(t, "pass") // printable ASCII including specials
		port := rapid.IntRange(1, 65535).Draw(t, "port")
		cfg := &Config{DBHost: host, DBPort: port, DBName: name, DBUser: "u", DBPassword: pass, AppPort: 4001}
		dsn := cfg.DSN()
		if !strings.HasPrefix(dsn, "postgresql://") {
			t.Fatalf("DSN %q does not start with postgresql://", dsn)
		}
	})
}

func TestAddrAlwaysHasColon(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		port := rapid.IntRange(1, 65535).Draw(t, "port")
		cfg := &Config{AppPort: port}
		if !strings.HasPrefix(cfg.Addr(), ":") {
			t.Fatalf("Addr %q does not start with ':'", cfg.Addr())
		}
	})
}

func TestValidateRejectsEmptyPassword(t *testing.T) {
	t.Setenv("DB_HOST", "h")
	t.Setenv("DB_NAME", "d")
	t.Setenv("DB_PASSWORD", "")
	_, err := Load()
	if err == nil {
		t.Error("expected error for empty DB_PASSWORD, got nil")
	}
}

func TestValidateRejectsInvalidPort(t *testing.T) {
	for _, port := range []int{0, -1, 65536, 99999} {
		cfg := &Config{DBHost: "h", DBName: "d", AppPort: port}
		if err := cfg.validate(); err == nil {
			t.Errorf("validate() with port %d: expected error, got nil", port)
		}
	}
}
