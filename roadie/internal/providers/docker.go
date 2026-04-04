package providers

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"strings"
)

// DockerProvider implements ContainerProvider using docker compose.
type DockerProvider struct {
	baseProvider
	composeFile    string
	devComposeFile string
	out            io.Writer
	run            cmdRunner
}

// NewDockerProvider creates a DockerProvider for the given compose files.
// out receives user-facing command output; pass os.Stdout for normal use.
func NewDockerProvider(composeFile, devComposeFile string, logger *slog.Logger, out io.Writer) *DockerProvider {
	return &DockerProvider{
		baseProvider:   newBase(logger),
		composeFile:    composeFile,
		devComposeFile: devComposeFile,
		out:            out,
		run:            realRunner{},
	}
}

// composeArgs builds the base "compose -f <file>" arg slice for the production stack.
func (d *DockerProvider) composeArgs() []string {
	return []string{"compose", "-f", d.composeFile}
}

// devComposeArgs builds the "compose -f <dev_file> -p dev" arg slice for the dev stack.
// The dev stack runs as a separate Docker project to avoid container name conflicts.
func (d *DockerProvider) devComposeArgs() []string {
	return []string{"compose", "-f", d.devComposeFile, "-p", "dev"}
}

func (d *DockerProvider) Up(ctx context.Context, cfg UpConfig) error {
	composeFile := d.composeFile
	if cfg.ComposeFile != "" {
		composeFile = cfg.ComposeFile
	}
	args := []string{"compose", "-f", composeFile, "up", "-d", "--remove-orphans"}
	if cfg.Build {
		args = append(args, "--build")
	}
	if cfg.ForceRecreate {
		args = append(args, "--force-recreate")
	}
	if err := d.run.Run(ctx, d.out, "docker", args...); err != nil {
		return err
	}
	if !cfg.WithDev {
		return nil
	}
	devFile := d.devComposeFile
	if cfg.DevComposeFile != "" {
		devFile = cfg.DevComposeFile
	}
	if devFile == "" {
		return fmt.Errorf("--dev requested but no dev compose file configured")
	}
	return d.run.Run(ctx, d.out, "docker", "compose", "-f", devFile, "-p", "dev", "up", "-d")
}

func (d *DockerProvider) Down(ctx context.Context, cfg DownConfig) error {
	if cfg.WithDev {
		devFile := d.devComposeFile
		if cfg.DevComposeFile != "" {
			devFile = cfg.DevComposeFile
		}
		if devFile == "" {
			return fmt.Errorf("--dev requested but no dev compose file configured")
		}
		if err := d.run.Run(ctx, d.out, "docker", "compose", "-f", devFile, "-p", "dev", "down"); err != nil {
			return err
		}
	}
	composeFile := d.composeFile
	if cfg.ComposeFile != "" {
		composeFile = cfg.ComposeFile
	}
	return d.run.Run(ctx, d.out, "docker", "compose", "-f", composeFile, "down")
}

func (d *DockerProvider) IsRunning(ctx context.Context, service string) (bool, error) {
	args := append(d.composeArgs(), "ps", "-q", service)
	out, err := d.run.Output(ctx, "docker", args...)
	if err != nil {
		return false, fmt.Errorf("checking service %s: %w", service, err)
	}
	return strings.TrimSpace(string(out)) != "", nil
}

// Status streams labelled docker compose ps output to d.out.
// Production services are always shown; dev services are shown when devComposeFile is set.
// The returned slice is nil; structured status is deferred to a later phase.
func (d *DockerProvider) Status(ctx context.Context) ([]ServiceStatus, error) {
	fmt.Fprintln(d.out, "=== Production ===")
	if err := d.run.Run(ctx, d.out, "docker", append(d.composeArgs(), "ps")...); err != nil {
		return nil, err
	}
	if d.devComposeFile == "" {
		return nil, nil
	}
	fmt.Fprintln(d.out, "\n=== Dev ===")
	return nil, d.run.Run(ctx, d.out, "docker", append(d.devComposeArgs(), "ps")...)
}

func (d *DockerProvider) Exec(ctx context.Context, service string, cmd []string) error {
	if len(cmd) == 0 {
		return fmt.Errorf("empty command for docker compose exec")
	}
	args := append(d.composeArgs(), "exec", "-T", service)
	args = append(args, cmd...)
	return d.run.Run(ctx, d.out, "docker", args...)
}
