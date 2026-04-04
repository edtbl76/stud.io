package providers

import (
	"context"
	"io"
	"os/exec"
)

// cmdRunner abstracts shell command execution so providers can be tested
// without spawning real processes.
type cmdRunner interface {
	Run(ctx context.Context, out io.Writer, name string, args ...string) error
	Output(ctx context.Context, name string, args ...string) ([]byte, error)
}

type realRunner struct{}

func (realRunner) Run(ctx context.Context, out io.Writer, name string, args ...string) error {
	cmd := exec.CommandContext(ctx, name, args...)
	cmd.Stdout = out
	cmd.Stderr = out
	return cmd.Run()
}

func (realRunner) Output(ctx context.Context, name string, args ...string) ([]byte, error) {
	return exec.CommandContext(ctx, name, args...).Output()
}
