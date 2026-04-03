package config

import (
	"fmt"
	"os"
	"path/filepath"

	"gopkg.in/yaml.v3"
)

// Load reads roadie.yml from the given root directory and returns a validated Config.
func Load(root string) (*Config, error) {
	path := filepath.Join(root, "roadie.yml")
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("reading %s: %w", path, err)
	}

	var cfg Config
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("parsing %s: %w", path, err)
	}

	if err := validate(&cfg); err != nil {
		return nil, fmt.Errorf("invalid config: %w", err)
	}

	return &cfg, nil
}

func validate(cfg *Config) error {
	if cfg.Providers.Container.ComposeFile == "" {
		return fmt.Errorf("providers.container.compose_file is required")
	}
	if cfg.Providers.Database.Service == "" {
		return fmt.Errorf("providers.database.service is required")
	}
	if cfg.Providers.Database.User == "" {
		return fmt.Errorf("providers.database.user is required")
	}
	return nil
}
