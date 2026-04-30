package commands

import (
	"context"
	"fmt"
	"os"

	"github.com/spf13/cobra"
	"github.com/studiocontrolroom/roadie/internal/config"
	"github.com/studiocontrolroom/roadie/internal/providers"
	"github.com/studiocontrolroom/roadie/internal/stack"
)

// AddStackCommands registers start, stop, restart, and status on the root command.
func AddStackCommands(root *cobra.Command) {
	root.AddCommand(startCmd(), stopCmd(), restartCmd(), statusCmd())
}

func loadConfig() (*config.Config, error) {
	cfg, err := config.Load(".")
	if err != nil {
		return nil, fmt.Errorf("loading roadie.yml: %w", err)
	}
	return cfg, nil
}

func newManager(cfg *config.Config) *stack.Manager {
	container := providers.NewDockerProvider(
		cfg.Providers.Container.ComposeFile,
		cfg.Providers.Container.DevComposeFile,
		nil,
		os.Stdout,
	)
	db := providers.NewPostgresProvider(cfg.Providers.Container.ComposeFile, nil)
	return stack.NewManager(container, db, providers.NewHTTPChecker(), os.Stdout)
}

// devCmd builds a Cobra command with a --dev flag. fn receives the manager,
// context, config, and the resolved dev flag value.
func devCmd(use, short string, fn func(context.Context, *stack.Manager, *config.Config, bool) error) *cobra.Command {
	var dev bool
	cmd := &cobra.Command{
		Use:   use,
		Short: short,
		RunE: func(cmd *cobra.Command, _ []string) error {
			cfg, err := loadConfig()
			if err != nil {
				return err
			}
			return fn(cmd.Context(), newManager(cfg), cfg, dev)
		},
	}
	cmd.Flags().BoolVar(&dev, "dev", false, "include dev tools (SonarQube, Woodpecker)")
	return cmd
}

func startCmd() *cobra.Command {
	return devCmd("start", "Start the STUD.io stack", func(ctx context.Context, m *stack.Manager, cfg *config.Config, dev bool) error {
		return m.Start(ctx, cfg, dev)
	})
}

func stopCmd() *cobra.Command {
	return devCmd("stop", "Stop the STUD.io stack", func(ctx context.Context, m *stack.Manager, cfg *config.Config, dev bool) error {
		return m.Stop(ctx, cfg, dev)
	})
}

func restartCmd() *cobra.Command {
	return devCmd("restart", "Restart the STUD.io stack", func(ctx context.Context, m *stack.Manager, cfg *config.Config, dev bool) error {
		if err := m.Stop(ctx, cfg, dev); err != nil {
			return err
		}
		return m.Start(ctx, cfg, dev)
	})
}

func statusCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "status",
		Short: "Show running stack services",
		RunE: func(cmd *cobra.Command, _ []string) error {
			cfg, err := loadConfig()
			if err != nil {
				return err
			}
			return newManager(cfg).Status(cmd.Context())
		},
	}
}
