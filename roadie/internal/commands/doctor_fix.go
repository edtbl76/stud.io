package commands

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"

	"github.com/spf13/cobra"
)

const woodpeckerAgentCount = 4

// secretsExcludes mirrors the exclude patterns used in DetectSecretsStep
// (pipeline/steps.go). Both lists must be kept in sync.
var secretsExcludes = []string{
	`node_modules/.*`,
	`\.git/.*`,
	`.*\.lock$`,
	`package-lock\.json`,
	`.*\.next/.*`,
	`.*__pycache__.*`,
	`\.secrets\.baseline`,
	`structurizr/workspace\.json`,
	`.*/e2e/\.auth/.*`,
	`.*/perf-reports/.*`,
}

type secretsResults map[string][]secretsFinding

type secretsFinding struct {
	Type         string `json:"type"`
	LineNumber   int    `json:"line_number"`
	HashedSecret string `json:"hashed_secret"`
}

type secretsDiff struct {
	file string
	desc string
}

// ── commands ──────────────────────────────────────────────────────────────────

func fixCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "fix <target>",
		Short: "Apply automated fixes for common issues",
		Long:  "Available targets: secrets, woodpecker-agents",
	}
	cmd.AddCommand(fixSecretsCmd(), fixWoodpeckerAgentsCmd())
	return cmd
}

func fixSecretsCmd() *cobra.Command {
	var dry bool
	cmd := &cobra.Command{
		Use:   "secrets",
		Short: "Rewrite .secrets.baseline to match the current codebase",
		RunE: func(cmd *cobra.Command, _ []string) error {
			return runFixSecrets(cmd.Context(), ".", os.Stdout, dry)
		},
	}
	cmd.Flags().BoolVar(&dry, "dry", false, "show what would change without writing the baseline")
	return cmd
}

func fixWoodpeckerAgentsCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "woodpecker-agents",
		Short: "Restart Woodpecker CI agents 1–4 via sudo systemctl",
		RunE: func(cmd *cobra.Command, _ []string) error {
			return runFixWoodpeckerAgents(cmd.Context(), os.Stdout)
		},
	}
}

// ── secrets ───────────────────────────────────────────────────────────────────

func runFixSecrets(ctx context.Context, root string, out io.Writer, dry bool) error {
	fmt.Fprintln(out, "[fix] Scanning for secrets...")
	raw, next, err := scanSecrets(ctx, root)
	if err != nil {
		return err
	}

	current, err := readSecretsBaseline(root)
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("reading baseline: %w", err)
	}

	added, removed := diffBaselines(current, next)
	printSecretsDiff(out, added, removed)

	if dry {
		fmt.Fprintln(out, "[fix] Dry run — .secrets.baseline not modified.")
		return nil
	}

	if err := os.WriteFile(filepath.Join(root, ".secrets.baseline"), raw, 0644); err != nil { //nolint:gosec
		return fmt.Errorf("writing .secrets.baseline: %w", err)
	}
	fmt.Fprintln(out, "[fix] .secrets.baseline updated.")
	return nil
}

func scanSecrets(ctx context.Context, root string) ([]byte, secretsResults, error) {
	args := []string{"scan"}
	for _, exc := range secretsExcludes {
		args = append(args, "--exclude-files", exc)
	}
	cmd := exec.CommandContext(ctx, "detect-secrets", args...)
	cmd.Dir = root
	raw, err := cmd.Output()
	if err != nil {
		return nil, nil, fmt.Errorf("detect-secrets scan: %w", err)
	}
	var baseline struct {
		Results secretsResults `json:"results"`
	}
	if err := json.Unmarshal(raw, &baseline); err != nil {
		return nil, nil, fmt.Errorf("parsing scan output: %w", err)
	}
	return raw, baseline.Results, nil
}

func readSecretsBaseline(root string) (secretsResults, error) {
	data, err := os.ReadFile(filepath.Join(root, ".secrets.baseline"))
	if err != nil {
		return nil, err
	}
	var baseline struct {
		Results secretsResults `json:"results"`
	}
	if err := json.Unmarshal(data, &baseline); err != nil {
		return nil, fmt.Errorf("parsing baseline: %w", err)
	}
	return baseline.Results, nil
}

func diffBaselines(current, next secretsResults) (added, removed []secretsDiff) {
	return newFindings(next, current), newFindings(current, next)
}

// newFindings returns entries present in from but absent in to.
func newFindings(from, to secretsResults) []secretsDiff {
	var diffs []secretsDiff
	for file, findings := range from {
		for _, f := range findings {
			if !containsFinding(to[file], f) {
				diffs = append(diffs, secretsDiff{file, f.Type + ":" + strconv.Itoa(f.LineNumber)})
			}
		}
	}
	sort.Slice(diffs, func(i, j int) bool { return diffs[i].file < diffs[j].file })
	return diffs
}

func containsFinding(findings []secretsFinding, f secretsFinding) bool {
	for _, existing := range findings {
		if existing.Type == f.Type && existing.LineNumber == f.LineNumber && existing.HashedSecret == f.HashedSecret {
			return true
		}
	}
	return false
}

func printDiffGroup(out io.Writer, label, prefix string, diffs []secretsDiff) {
	if len(diffs) == 0 {
		return
	}
	fmt.Fprintf(out, "[fix] %s (%d):\n", label, len(diffs))
	for _, d := range diffs {
		fmt.Fprintf(out, "[fix]   %s %s  %s\n", prefix, d.file, d.desc)
	}
}

func printSecretsDiff(out io.Writer, added, removed []secretsDiff) {
	if len(added) == 0 && len(removed) == 0 {
		fmt.Fprintln(out, "[fix] No changes — baseline is already up to date.")
		return
	}
	printDiffGroup(out, "New findings to baseline", "+", added)
	printDiffGroup(out, "Entries removed from codebase", "-", removed)
}

// ── woodpecker ────────────────────────────────────────────────────────────────

func runFixWoodpeckerAgents(ctx context.Context, out io.Writer) error {
	for i := 1; i <= woodpeckerAgentCount; i++ {
		agent := fmt.Sprintf("woodpecker-agent-%d", i)
		fmt.Fprintf(out, "[fix] Restarting %s...\n", agent)
		cmd := exec.CommandContext(ctx, "sudo", "systemctl", "restart", agent)
		cmd.Stdin = os.Stdin
		cmd.Stdout = out
		cmd.Stderr = out
		if err := cmd.Run(); err != nil {
			return fmt.Errorf("restarting %s: %w", agent, err)
		}
		fmt.Fprintf(out, "[fix] %s restarted.\n", agent)
	}
	return nil
}
