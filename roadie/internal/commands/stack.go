package commands

import (
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

func startCmd() *cobra.Command {
	var dev bool
	cmd := &cobra.Command{
		Use:   "start",
		Short: "Start the STUD.io stack",
		RunE: func(cmd *cobra.Command, _ []string) error {
			cfg, err := loadConfig()
			if err != nil {
				return err
			}
			return newManager(cfg).Start(cmd.Context(), cfg, dev)
		},
	}
	cmd.Flags().BoolVar(&dev, "dev", false, "include dev tools (SonarQube, Structurizr)")
	return cmd
}

func stopCmd() *cobra.Command {
	var dev bool
	cmd := &cobra.Command{
		Use:   "stop",
		Short: "Stop the STUD.io stack",
		RunE: func(cmd *cobra.Command, _ []string) error {
			cfg, err := loadConfig()
			if err != nil {
				return err
			}
			return newManager(cfg).Stop(cmd.Context(), cfg, dev)
		},
	}
	cmd.Flags().BoolVar(&dev, "dev", false, "include dev tools")
	return cmd
}

func restartCmd() *cobra.Command {
	var dev bool
	cmd := &cobra.Command{
		Use:   "restart",
		Short: "Restart the STUD.io stack",
		RunE: func(cmd *cobra.Command, _ []string) error {
			cfg, err := loadConfig()
			if err != nil {
				return err
			}
			m := newManager(cfg)
			if err := m.Stop(cmd.Context(), cfg, dev); err != nil {
				return err
			}
			return m.Start(cmd.Context(), cfg, dev)
		},
	}
	cmd.Flags().BoolVar(&dev, "dev", false, "include dev tools")
	return cmd
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
