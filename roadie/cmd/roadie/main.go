package main

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
	"github.com/studiocontrolroom/roadie/internal/commands"
)

// version is set at build time via -ldflags "-X main.version=x.y.z".
var version = "dev"

var verbose bool

func main() {
	root := &cobra.Command{
		Use:   "roadie",
		Short: "STUD.io development CLI",
		Long: `Roadie manages the STUD.io stack, builds, tests, scans, and releases.

Run 'roadie <command> --help' for details on a specific command.`,
		SilenceUsage: true,
	}

	root.PersistentFlags().BoolVarP(&verbose, "verbose", "v", false, "verbose output")

	root.AddCommand(versionCmd())
	commands.AddStackCommands(root)
	commands.AddBuildCommands(root)
	commands.AddDBCommands(root)

	if err := root.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func versionCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "version",
		Short: "Print the roadie version",
		Run: func(cmd *cobra.Command, args []string) {
			fmt.Printf("roadie %s\n", version)
		},
	}
}
