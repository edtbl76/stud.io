package commands

import "github.com/studiocontrolroom/roadie/internal/config"

// minimalTestConfig returns a *config.Config populated with representative
// values used by e2eConfigFrom / perfConfigFrom tests.
func minimalTestConfig() *config.Config {
	return &config.Config{
		Providers: config.ProvidersConfig{
			Container: config.ContainerProviderConfig{
				ComposeFile:    "docker-compose.yml",
				DevComposeFile: "docker-compose.dev.yml",
			},
			Database: config.DatabaseProviderConfig{
				Service: "studio_db",
				User:    "studio",
			},
		},
		Test: config.TestConfig{
			E2E: config.E2ETestConfig{
				Shards:                4,
				BackendComposeProject: "dev",
				BackendService:        "controlroom_backend_test",
				BackendInternalPort:   5150,
				BackendBasePort:       5151,
				FrontendBasePort:      3001,
			},
			Perf: config.PerfTestConfig{
				BackendPort:  5160,
				FrontendPort: 3010,
			},
			DB: config.TestDBConfig{
				Container: "studio_db",
				User:      "studio",
				Password:  "studio", // pragma: allowlist secret
				Source:    "controlroomdb_test",
			},
		},
	}
}
