package config

// Config is the top-level structure of roadie.yml.
type Config struct {
	Providers ProvidersConfig `yaml:"providers"`
	Stack     StackConfig     `yaml:"stack"`
	Build     BuildConfig     `yaml:"build"`
}

// BuildConfig controls what "roadie build" applies to test databases.
// The production database is never touched by "roadie build" — use "roadie db init"
// for first-time production setup.
type BuildConfig struct {
	// SchemaFiles lists SQL files applied to each test database during build,
	// in order. Paths are relative to the repo root.
	SchemaFiles []string `yaml:"schema_files"`
	// Databases lists the test database names that receive the schema files.
	// The production database must never appear here.
	Databases []string `yaml:"databases"`
}

// ProvidersConfig holds configuration for each provider type.
type ProvidersConfig struct {
	Container ContainerProviderConfig `yaml:"container"`
	Database  DatabaseProviderConfig  `yaml:"database"`
}

// ContainerProviderConfig configures the container provider.
type ContainerProviderConfig struct {
	Type           string `yaml:"type"`
	ComposeFile    string `yaml:"compose_file"`
	DevComposeFile string `yaml:"dev_compose_file"`
}

// DatabaseProviderConfig configures the database provider.
type DatabaseProviderConfig struct {
	Type    string `yaml:"type"`
	Service string `yaml:"service"`
	User    string `yaml:"user"`
	// DBName is the production database name. Used by "roadie db init".
	// Not required for stack management commands.
	DBName string `yaml:"db_name"`
}

// StackConfig defines the services and health checks for the stack.
type StackConfig struct {
	HealthChecks    []HealthCheck `yaml:"health_checks"`
	DevHealthChecks []HealthCheck `yaml:"dev_health_checks"`
	URLs            URLsConfig    `yaml:"urls"`
}

// HealthCheck describes a single health check to perform during stack startup.
// Type is one of "http" or "database".
type HealthCheck struct {
	Name string `yaml:"name"`
	Type string `yaml:"type"`
	URL  string `yaml:"url,omitempty"`
	User string `yaml:"user,omitempty"`
}

// URLsConfig holds the display URLs shown after a successful stack start.
type URLsConfig struct {
	App         string `yaml:"app"`
	API         string `yaml:"api"`
	Docs        string `yaml:"docs"`
	SonarQube   string `yaml:"sonarqube"`
	Structurizr string `yaml:"structurizr"`
}
