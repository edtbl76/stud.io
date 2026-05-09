package config

import (
	"os"
	"testing"

	"pgregory.net/rapid"
)

func TestPropertiesConfigRoundTrip(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		apiKey := rapid.StringMatching(`[a-zA-Z0-9_-]{0,64}`).Draw(rt, "api_key")
		serverURL := rapid.StringMatching(`https?://[a-z0-9.-]+(:[0-9]+)?`).Draw(rt, "server_url")

		dir, err := os.MkdirTemp("", "pbt-config-*")
		if err != nil {
			rt.Fatal(err)
		}
		defer os.RemoveAll(dir)
		origHome := os.Getenv("HOME")
		os.Setenv("HOME", dir)
		defer os.Setenv("HOME", origHome)

		if err := Save("api_key", apiKey); err != nil {
			rt.Fatal(err)
		}
		if err := Save("server_url", serverURL); err != nil {
			rt.Fatal(err)
		}

		cfg, err := Load()
		if err != nil {
			rt.Fatal(err)
		}
		if cfg.APIKey != apiKey {
			rt.Fatalf("api_key round-trip failed: got %q, want %q", cfg.APIKey, apiKey)
		}
		if cfg.ServerURL != serverURL {
			rt.Fatalf("server_url round-trip failed: got %q, want %q", cfg.ServerURL, serverURL)
		}
	})
}

func TestPropertiesConfigDefaults(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		dir, err := os.MkdirTemp("", "pbt-defaults-*")
		if err != nil {
			rt.Fatal(err)
		}
		defer os.RemoveAll(dir)
		origHome := os.Getenv("HOME")
		os.Setenv("HOME", dir)
		defer os.Setenv("HOME", origHome)

		cfg, err := Load()
		if err != nil {
			rt.Fatal(err)
		}
		if cfg.ServerURL == "" {
			rt.Fatal("ServerURL must never be empty after Load()")
		}
		if cfg.TimeoutSeconds <= 0 {
			rt.Fatal("TimeoutSeconds must be positive after Load()")
		}
		if len(cfg.ScanPaths) == 0 {
			rt.Fatal("ScanPaths must never be empty after Load()")
		}
		if cfg.MachineName == "" {
			rt.Fatal("MachineName must never be empty after Load()")
		}
	})
}
