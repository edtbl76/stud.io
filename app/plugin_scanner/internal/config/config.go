package config

import (
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"
)

const defaultServerURL = "https://localhost:5150"
const defaultTimeout = 300
const configPerms = 0600

var defaultScanPaths = []string{
	"~/Library/Audio/Plug-Ins/VST3",
	"/Library/Audio/Plug-Ins/VST3",
	"~/Library/Audio/Plug-Ins/Components",
	"/Library/Audio/Plug-Ins/Components",
	"~/Library/Audio/Plug-Ins/VST",
	"/Library/Audio/Plug-Ins/VST",
}

// Config holds resolved plugin-scanner configuration.
type Config struct {
	APIKey         string   `yaml:"api_key"`
	ScanPaths      []string `yaml:"scan_paths"`
	ServerURL      string   `yaml:"server_url"`
	CACertPath     string   `yaml:"ca_cert_path"`
	MachineName    string   `yaml:"machine_name"`
	TimeoutSeconds int      `yaml:"timeout_seconds"`
}

// CASource describes how the CA certificate was resolved.
type CASource string

const (
	CASourceConfigOverride CASource = "config-override"
	CASourceMkcertAuto     CASource = "mkcert-auto"
	CASourceSystemRoots    CASource = "system-roots"
)

// ResolvedCA holds the TLS config and the source that produced it.
type ResolvedCA struct {
	TLSConfig *tls.Config
	Source    CASource
}

func configPath() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".plugin-scanner.yml")
}

// Load reads ~/.plugin-scanner.yml and applies defaults.
func Load() (*Config, error) {
	path := configPath()
	cfg := &Config{}

	data, err := os.ReadFile(path)
	if err != nil && !os.IsNotExist(err) {
		return nil, fmt.Errorf("reading config: %w", err)
	}
	if err == nil {
		if err := checkPerms(path); err != nil {
			fmt.Fprintf(os.Stderr, "warning: %v\n", err)
		}
		if err := yaml.Unmarshal(data, cfg); err != nil {
			return nil, fmt.Errorf("parsing config: %w", err)
		}
	}

	applyDefaults(cfg)
	return cfg, nil
}

func applyDefaults(cfg *Config) {
	if len(cfg.ScanPaths) == 0 {
		cfg.ScanPaths = defaultScanPaths
	}
	if cfg.ServerURL == "" {
		cfg.ServerURL = defaultServerURL
	}
	if cfg.TimeoutSeconds <= 0 {
		cfg.TimeoutSeconds = defaultTimeout
	}
	if cfg.MachineName == "" {
		cfg.MachineName, _ = os.Hostname()
	}
	for i, p := range cfg.ScanPaths {
		cfg.ScanPaths[i] = expandHome(p)
	}
}

func checkPerms(path string) error {
	info, err := os.Stat(path)
	if err != nil {
		return nil
	}
	if info.Mode().Perm() > configPerms {
		return fmt.Errorf("config file %s has permissions %04o (expected 0600) — consider running: chmod 600 %s", path, info.Mode().Perm(), path)
	}
	return nil
}

// Save writes a single key-value pair to the config file.
func Save(key, value string) error {
	if key == "scan_paths" {
		return fmt.Errorf("scan_paths is list-valued — edit ~/.plugin-scanner.yml directly")
	}
	path := configPath()
	raw := map[string]any{}
	data, err := os.ReadFile(path)
	if err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("reading config: %w", err)
	}
	if err == nil {
		if err := yaml.Unmarshal(data, &raw); err != nil {
			return fmt.Errorf("parsing config: %w", err)
		}
	}
	raw[key] = value
	out, err := yaml.Marshal(raw)
	if err != nil {
		return fmt.Errorf("marshalling config: %w", err)
	}
	return os.WriteFile(path, out, configPerms)
}

// ResolveCA returns a TLS config with the appropriate CA certificate pool.
func ResolveCA(caCertPath string) (*ResolvedCA, error) {
	if caCertPath != "" {
		return resolveFromPath(caCertPath, CASourceConfigOverride)
	}
	if resolved := resolveMkcert(); resolved != nil {
		return resolved, nil
	}
	return &ResolvedCA{TLSConfig: &tls.Config{MinVersion: tls.VersionTLS12}, Source: CASourceSystemRoots}, nil
}

func resolveFromPath(path string, source CASource) (*ResolvedCA, error) {
	tlsCfg, err := loadCACert(path)
	if err != nil {
		return nil, fmt.Errorf("loading ca_cert_path: %w", err)
	}
	return &ResolvedCA{TLSConfig: tlsCfg, Source: source}, nil
}

func resolveMkcert() *ResolvedCA {
	path := mkcertRootCA()
	if path == "" {
		return nil
	}
	tlsCfg, err := loadCACert(path)
	if err != nil {
		return nil
	}
	return &ResolvedCA{TLSConfig: tlsCfg, Source: CASourceMkcertAuto}
}

func loadCACert(path string) (*tls.Config, error) {
	pem, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("reading CA cert %s: %w", path, err)
	}
	pool := x509.NewCertPool()
	if !pool.AppendCertsFromPEM(pem) {
		return nil, fmt.Errorf("no valid certificates found in %s", path)
	}
	return &tls.Config{RootCAs: pool, MinVersion: tls.VersionTLS12}, nil
}

func mkcertRootCA() string {
	out, err := exec.Command("mkcert", "-CAROOT").Output()
	if err != nil {
		return ""
	}
	dir := strings.TrimSpace(string(out))
	path := filepath.Join(dir, "rootCA.pem")
	if _, err := os.Stat(path); err != nil {
		return ""
	}
	return path
}

func expandHome(path string) string {
	if !strings.HasPrefix(path, "~/") {
		return path
	}
	home, _ := os.UserHomeDir()
	return filepath.Join(home, path[2:])
}

// Redact returns the api_key with all but the last 4 characters masked.
func Redact(key string) string {
	if len(key) <= 4 {
		return strings.Repeat("*", len(key))
	}
	return strings.Repeat("*", len(key)-4) + key[len(key)-4:]
}
