package main

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/spf13/cobra"
	"github.com/studiocontrolroom/plugin_scanner/internal/client"
	"github.com/studiocontrolroom/plugin_scanner/internal/config"
	"github.com/studiocontrolroom/plugin_scanner/internal/metadata"
	"github.com/studiocontrolroom/plugin_scanner/internal/scanner"
)

// version is set at build time via -ldflags "-X main.version=<tag>".
var version = "dev"

func main() {
	if err := rootCmd().Execute(); err != nil {
		os.Exit(1)
	}
}

func rootCmd() *cobra.Command {
	var noColor bool
	root := &cobra.Command{
		Use:          "plugin-scanner",
		Short:        "Scan macOS plugin directories and upload results to ControlRoom",
		SilenceUsage: true,
	}
	root.PersistentFlags().BoolVar(&noColor, "no-color", false, "disable colored output")
	root.AddCommand(
		scanCmd(&noColor),
		authCmd(),
		versionCmd(),
		configCmd(),
	)
	return root
}

// ---------------------------------------------------------------------------
// scan
// ---------------------------------------------------------------------------

func scanCmd(noColor *bool) *cobra.Command {
	var jsonOut bool
	var dryRun bool
	var timeoutSecs int

	cmd := &cobra.Command{
		Use:   "scan",
		Short: "Scan plugin directories and upload results to ControlRoom",
		RunE: func(_ *cobra.Command, _ []string) error {
			return runScan(noColor, jsonOut, dryRun, timeoutSecs)
		},
	}
	cmd.Flags().BoolVar(&jsonOut, "json", false, "output results as JSON")
	cmd.Flags().BoolVar(&dryRun, "dry-run", false, "scan without uploading to ControlRoom")
	cmd.Flags().IntVar(&timeoutSecs, "timeout", 0, "operation timeout in seconds (overrides config)")
	return cmd
}

func runScan(noColor *bool, jsonOut, dryRun bool, timeoutSecs int) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	if err := validateScanConfig(cfg, dryRun); err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), scanTimeout(cfg, timeoutSecs))
	defer cancel()

	s := scanner.New(os.Stdout, *noColor, jsonOut)
	run, err := discoverPlugins(ctx, s, cfg.ScanPaths)
	if err != nil {
		return err
	}
	kept, excluded := fetchAndFilterExclusions(ctx, cfg, run.Discovered)
	run.ExcludedPlugins = excluded
	if !dryRun {
		p := uploadParams{
			ctx:      ctx,
			cfg:      cfg,
			kept:     kept,
			progress: func(cur, total int) { s.PrintUploadProgress(cur, total) },
		}
		if err := uploadScan(s, &run, p); err != nil {
			return err
		}
	}
	return scanner.NewRenderer(os.Stdout, *noColor).Render(run, renderMode(jsonOut, dryRun))
}

// fetchAndFilterExclusions pre-filters excluded plugins before upload. The
// pre-filter is an optimization only — the server applies exclusions during
// ingest regardless — so any failure here is non-fatal: it warns and falls
// back to uploading the full discovered list.
func fetchAndFilterExclusions(ctx context.Context, cfg *config.Config, discovered []metadata.DiscoveredPlugin) (kept, excluded []metadata.DiscoveredPlugin) {
	if cfg.ServerURL == "" || cfg.APIKey == "" {
		return discovered, nil
	}
	resolved, err := config.ResolveCA(cfg.CACertPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "warning: skipping exclusion pre-filter: %v\n", err)
		return discovered, nil
	}
	apiClient := client.NewAPIClient(cfg.ServerURL, cfg.APIKey, resolved.TLSConfig, nil)
	exclusions, err := apiClient.GetExclusions(ctx)
	if err != nil {
		fmt.Fprintf(os.Stderr, "warning: skipping exclusion pre-filter: %v\n", err)
		return discovered, nil
	}
	return scanner.FilterExcluded(discovered, exclusions)
}

func validateScanConfig(cfg *config.Config, dryRun bool) error {
	if !dryRun {
		if cfg.APIKey == "" {
			return fmt.Errorf("no API key configured. Run: plugin-scanner auth set-key <key>")
		}
		if cfg.ServerURL == "" {
			return fmt.Errorf("no server URL configured. Run: plugin-scanner config set server_url <url>")
		}
	}
	return nil
}

func scanTimeout(cfg *config.Config, override int) time.Duration {
	if override > 0 {
		return time.Duration(override) * time.Second
	}
	return time.Duration(cfg.TimeoutSeconds) * time.Second
}

func discoverPlugins(ctx context.Context, s *scanner.Scanner, paths []string) (scanner.ScanRun, error) {
	plugins, skipped, err := s.Scan(ctx, paths)
	if err != nil && ctx.Err() == nil {
		return scanner.ScanRun{}, err
	}
	return scanner.ScanRun{Discovered: plugins, SkippedPaths: skipped}, nil
}

type uploadParams struct {
	ctx      context.Context
	cfg      *config.Config
	progress func(int, int)
	kept     []metadata.DiscoveredPlugin
}

func uploadScan(s *scanner.Scanner, run *scanner.ScanRun, p uploadParams) error {
	resolved, err := config.ResolveCA(p.cfg.CACertPath)
	if err != nil {
		return err
	}
	apiClient := client.NewAPIClient(p.cfg.ServerURL, p.cfg.APIKey, resolved.TLSConfig, p.progress)
	summary, err := apiClient.PostScan(p.ctx, p.kept, p.cfg.MachineName)
	if err != nil {
		return err
	}
	s.PrintUploadDone()
	run.Summary = summary
	run.ScanID = summary.ScanID
	return nil
}

func renderMode(jsonOut, dryRun bool) scanner.RenderMode {
	if jsonOut {
		return scanner.RenderModeJSON
	}
	if dryRun {
		return scanner.RenderModeDryRun
	}
	return scanner.RenderModeTerminal
}

// ---------------------------------------------------------------------------
// auth
// ---------------------------------------------------------------------------

func authCmd() *cobra.Command {
	auth := &cobra.Command{
		Use:   "auth",
		Short: "Manage authentication",
	}
	auth.AddCommand(&cobra.Command{
		Use:   "set-key <key>",
		Short: "Store an API key in ~/.plugin-scanner.yml",
		Args:  cobra.ExactArgs(1),
		RunE: func(_ *cobra.Command, args []string) error {
			if err := config.Save("api_key", args[0]); err != nil {
				return err
			}
			fmt.Println("API key saved to ~/.plugin-scanner.yml")
			return nil
		},
	})
	return auth
}

// ---------------------------------------------------------------------------
// version
// ---------------------------------------------------------------------------

func versionCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "version",
		Short: "Print the plugin-scanner version",
		Run: func(_ *cobra.Command, _ []string) {
			fmt.Println(version)
		},
	}
}

// ---------------------------------------------------------------------------
// config
// ---------------------------------------------------------------------------

func configCmd() *cobra.Command {
	cfg := &cobra.Command{
		Use:   "config",
		Short: "Manage plugin-scanner configuration",
	}
	cfg.AddCommand(configShowCmd(), configSetCmd())
	return cfg
}

func configShowCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "show",
		Short: "Print the resolved configuration",
		RunE: func(_ *cobra.Command, _ []string) error {
			cfg, err := config.Load()
			if err != nil {
				return err
			}
			fmt.Printf("api_key:         %s\n", config.Redact(cfg.APIKey))
			fmt.Printf("server_url:      %s\n", cfg.ServerURL)
			fmt.Printf("machine_name:    %s\n", cfg.MachineName)
			fmt.Printf("ca_cert_path:    %s\n", cfg.CACertPath)
			fmt.Printf("timeout_seconds: %d\n", cfg.TimeoutSeconds)
			fmt.Printf("scan_paths:\n")
			for _, p := range cfg.ScanPaths {
				fmt.Printf("  - %s\n", p)
			}
			return nil
		},
	}
}

func configSetCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "set <key> <value>",
		Short: "Set a configuration value",
		Args:  cobra.ExactArgs(2),
		RunE: func(_ *cobra.Command, args []string) error {
			if err := config.Save(args[0], args[1]); err != nil {
				return err
			}
			fmt.Printf("%s updated in ~/.plugin-scanner.yml\n", args[0])
			return nil
		},
	}
}
