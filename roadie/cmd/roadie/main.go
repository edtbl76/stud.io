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
	root.CompletionOptions.DisableDefaultCmd = true

	root.AddCommand(versionCmd(), completionCmd(root))
	commands.AddStackCommands(root)
	commands.AddBuildCommands(root)
	commands.AddDBCommands(root)
	commands.AddTestCommands(root)

	if err := root.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

// completionCmd replaces Cobra's default completion command. It always writes
// to stdout so the caller controls where the script lands. The Long help text
// explains the correct install pattern — the common mistake is using
// "sudo roadie completion bash > /etc/..." which fails because the shell's
// redirect runs as the current user, not root. Use tee instead:
//
//	roadie completion bash | sudo tee /etc/bash_completion.d/roadie
func completionCmd(root *cobra.Command) *cobra.Command {
	return &cobra.Command{
		Use:       "completion [bash|zsh|fish]",
		Short:     "Generate shell completion script",
		ValidArgs: []string{"bash", "zsh", "fish"},
		Args:      cobra.ExactArgs(1),
		Long: `Print a shell completion script to stdout.

Install system-wide (note: use tee, not >, for the sudo redirect):
  roadie completion bash | sudo tee /etc/bash_completion.d/roadie

Install for current user only:
  mkdir -p ~/.local/share/bash-completion/completions
  roadie completion bash > ~/.local/share/bash-completion/completions/roadie
  source ~/.bashrc`,
		RunE: func(cmd *cobra.Command, args []string) error {
			switch args[0] {
			case "bash":
				return root.GenBashCompletion(os.Stdout)
			case "zsh":
				return root.GenZshCompletion(os.Stdout)
			case "fish":
				return root.GenFishCompletion(os.Stdout, true)
			default:
				return fmt.Errorf("unsupported shell %q: use bash, zsh, or fish", args[0])
			}
		},
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
