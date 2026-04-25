package config

import (
	"fmt"
	"os"
	"strconv"
)

// Config holds all runtime configuration for the gearlist service.
type Config struct {
	DBHost     string
	DBPort     int
	DBName     string
	DBUser     string
	DBPassword string
	AppPort    int
}

// Load reads configuration from environment variables with sensible defaults.
func Load() (*Config, error) {
	cfg := &Config{
		DBHost:     env("DB_HOST", "studio_db"),
		DBPort:     envInt("DB_PORT", 5432),
		DBName:     env("DB_NAME", "masterdb"),
		DBUser:     env("DB_USER", "studio"),
		DBPassword: env("DB_PASSWORD", "studio"),
		AppPort:    envInt("APP_PORT", 4001),
	}
	return cfg, cfg.validate()
}

// DSN returns the PostgreSQL connection string.
func (c *Config) DSN() string {
	return fmt.Sprintf("postgresql://%s:%s@%s:%d/%s",
		c.DBUser, c.DBPassword, c.DBHost, c.DBPort, c.DBName)
}

// Addr returns the TCP address the HTTP server should bind to.
func (c *Config) Addr() string {
	return fmt.Sprintf(":%d", c.AppPort)
}

func (c *Config) validate() error {
	if c.DBHost == "" {
		return fmt.Errorf("DB_HOST must not be empty")
	}
	if c.DBName == "" {
		return fmt.Errorf("DB_NAME must not be empty")
	}
	if c.AppPort < 1 || c.AppPort > 65535 {
		return fmt.Errorf("APP_PORT %d is out of range [1, 65535]", c.AppPort)
	}
	return nil
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func envInt(key string, fallback int) int {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return fallback
	}
	return n
}
