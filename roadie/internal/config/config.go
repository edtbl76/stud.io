package config

import (
	"fmt"
	"net/url"
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
	if err := validateHealthChecks("health_checks", cfg.Stack.HealthChecks); err != nil {
		return err
	}
	if err := validateHealthChecks("dev_health_checks", cfg.Stack.DevHealthChecks); err != nil {
		return err
	}
	return nil
}

func validateHealthChecks(section string, checks []HealthCheck) error {
	for i, c := range checks {
		if err := validateOneHealthCheck(section, i, c); err != nil {
			return err
		}
	}
	return nil
}

func validateOneHealthCheck(section string, i int, c HealthCheck) error {
	if c.Type == "" {
		return fmt.Errorf("stack.%s[%d]: missing type", section, i)
	}
	switch c.Type {
	case "http":
		return validateHTTPCheck(section, i, c)
	case "database":
		return validateDatabaseCheck(section, i, c)
	default:
		return fmt.Errorf("stack.%s[%d]: unknown type %q", section, i, c.Type)
	}
}

func validateHTTPCheck(section string, i int, c HealthCheck) error {
	if c.URL == "" {
		return fmt.Errorf("stack.%s[%d]: http check missing url", section, i)
	}
	if _, err := url.ParseRequestURI(c.URL); err != nil {
		return fmt.Errorf("stack.%s[%d]: invalid url %q: %w", section, i, c.URL, err)
	}
	return nil
}

func validateDatabaseCheck(section string, i int, c HealthCheck) error {
	if c.User == "" {
		return fmt.Errorf("stack.%s[%d]: database check missing user", section, i)
	}
	return nil
}
