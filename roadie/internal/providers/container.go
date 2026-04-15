package providers

import "context"

// UpConfig parameterises a container stack start operation.
type UpConfig struct {
	ComposeFile    string
	DevComposeFile string
	WithDev        bool
	Build          bool
	ForceRecreate  bool
}

// DownConfig parameterises a container stack stop operation.
type DownConfig struct {
	ComposeFile    string
	DevComposeFile string
	WithDev        bool
}

// ServiceStatus describes the runtime state of a single container service.
type ServiceStatus struct {
	Name   string
	State  string
	Health string
}

// ContainerProvider abstracts container orchestration.
// DockerProvider is the production implementation; other implementations
// (e.g. Podman) can be added without changing callers.
type ContainerProvider interface {
	Up(ctx context.Context, cfg UpConfig) error
	Down(ctx context.Context, cfg DownConfig) error
	IsRunning(ctx context.Context, service string) (bool, error)
	Status(ctx context.Context) ([]ServiceStatus, error)
	Exec(ctx context.Context, service string, cmd []string) error
	// RemoveContainers forcibly removes each named container (docker rm -f).
	// Errors for individual containers are silently ignored — the intent is
	// best-effort cleanup of potentially non-existent containers.
	RemoveContainers(ctx context.Context, names []string) error
}
