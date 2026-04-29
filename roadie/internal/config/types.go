package config

// Config is the top-level structure of roadie.yml.
type Config struct {
	Providers ProvidersConfig `yaml:"providers"`
	Stack     StackConfig     `yaml:"stack"`
	Build     BuildConfig     `yaml:"build"`
	Test      TestConfig      `yaml:"test"`
}

// TestConfig holds configuration for the test suites (e2e, perf, pbt, shared DB).
// All fields are optional — omitting the test: section leaves zero values.
type TestConfig struct {
	E2E  E2ETestConfig  `yaml:"e2e"`
	Perf PerfTestConfig `yaml:"perf"`
	PBT  PBTTestConfig  `yaml:"pbt"`
	DB   TestDBConfig   `yaml:"db"`
}

// E2ETestConfig configures the sharded E2E runner.
type E2ETestConfig struct {
	Shards                int    `yaml:"shards"`
	BackendComposeProject string `yaml:"backend_compose_project"`
	BackendService        string `yaml:"backend_service"`
	BackendInternalPort   int    `yaml:"backend_internal_port"`
	BackendBasePort       int    `yaml:"backend_base_port"`
	FrontendBasePort      int    `yaml:"frontend_base_port"`
	GearlistService       string `yaml:"gearlist_service"`
	GearlistPort          int    `yaml:"gearlist_port"`
	GearlistInternalPort  int    `yaml:"gearlist_internal_port"`
}

// PBTTestConfig configures property-based test runners (fast-check, hypothesis).
type PBTTestConfig struct {
	// Examples is the number of generated test cases per property for both
	// fast-check and hypothesis. Zero means use the tool default (100).
	Examples int `yaml:"examples"`
}

// PerfTestConfig configures the performance test runner.
type PerfTestConfig struct {
	BackendPort          int    `yaml:"backend_port"`
	FrontendPort         int    `yaml:"frontend_port"`
	CarbonURL            string `yaml:"carbon_base_url"`
	GearlistService      string `yaml:"gearlist_service"`
	GearlistPort         int    `yaml:"gearlist_port"`
	GearlistInternalPort int    `yaml:"gearlist_internal_port"`
}

// TestDBConfig holds credentials for provisioning per-shard test databases.
type TestDBConfig struct {
	Container string `yaml:"container"`
	User      string `yaml:"user"`
	Password  string `yaml:"password"`
	Source    string `yaml:"source"`
}

// BuildConfig controls what "roadie build" applies to test databases.
// The production database is never touched by "roadie build" — use "roadie db init"
// for first-time production setup.
type BuildConfig struct {
	// SchemaFiles lists SQL files applied to each test database during build,
	// in order. Paths are relative to the repo root.
	SchemaFiles []string `yaml:"schema_files"`
	// SeedFiles lists SQL files applied after schema, in order. Used to
	// populate reference/lookup data so E2E tests find non-empty tables.
	// Files must be idempotent (e.g. ON CONFLICT DO UPDATE).
	SeedFiles []string `yaml:"seed_files"`
	// Databases lists the test database names that receive the schema files.
	// The production database must never appear here.
	Databases []string `yaml:"databases"`
	// RebuildOn lists files whose content is hashed to decide whether a
	// container rebuild is needed. When the hash matches .roadie-cache/docker-hash,
	// roadie start is used instead of roadie build (skipping --build --force-recreate).
	// If empty, a full rebuild always runs. Paths are relative to the repo root.
	RebuildOn []string `yaml:"rebuild_on"`
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
	GearList    string `yaml:"gearlist"`
	MinIO       string `yaml:"minio"`
	SonarQube   string `yaml:"sonarqube"`
	Structurizr string `yaml:"structurizr"`
	Woodpecker  string `yaml:"woodpecker"`
}
