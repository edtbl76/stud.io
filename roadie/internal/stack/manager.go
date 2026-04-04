package stack

import (
	"context"
	"fmt"
	"io"
	"time"

	"github.com/studiocontrolroom/roadie/internal/config"
	"github.com/studiocontrolroom/roadie/internal/providers"
)

const (
	defaultCheckTimeout  = 5 * time.Minute
	defaultCheckInterval = 2 * time.Second
)

// Manager orchestrates the container stack and its health checks.
type Manager struct {
	container     providers.ContainerProvider
	db            providers.SQLDatabaseProvider
	http          providers.HTTPHealthChecker
	out           io.Writer
	checkTimeout  time.Duration
	checkInterval time.Duration
}

// NewManager creates a Manager with the given providers.
func NewManager(
	container providers.ContainerProvider,
	db providers.SQLDatabaseProvider,
	http providers.HTTPHealthChecker,
	out io.Writer,
) *Manager {
	return &Manager{
		container:     container,
		db:            db,
		http:          http,
		out:           out,
		checkTimeout:  defaultCheckTimeout,
		checkInterval: defaultCheckInterval,
	}
}

// Start brings the stack up and waits for all configured health checks to pass.
func (m *Manager) Start(ctx context.Context, cfg *config.Config, withDev bool) error {
	fmt.Fprintln(m.out, "[roadie] Starting production stack...")
	if err := m.container.Up(ctx, providers.UpConfig{
		ComposeFile:    cfg.Providers.Container.ComposeFile,
		DevComposeFile: cfg.Providers.Container.DevComposeFile,
		WithDev:        withDev,
	}); err != nil {
		return fmt.Errorf("starting stack: %w", err)
	}

	checks := cfg.Stack.HealthChecks
	if withDev {
		checks = append(checks, cfg.Stack.DevHealthChecks...)
	}
	for _, check := range checks {
		if err := m.waitForCheck(ctx, cfg, check); err != nil {
			return err
		}
	}

	m.printURLs(cfg, withDev)
	return nil
}

// Stop brings the stack down.
func (m *Manager) Stop(ctx context.Context, cfg *config.Config, withDev bool) error {
	fmt.Fprintln(m.out, "[roadie] Stopping stack...")
	if err := m.container.Down(ctx, providers.DownConfig{
		ComposeFile:    cfg.Providers.Container.ComposeFile,
		DevComposeFile: cfg.Providers.Container.DevComposeFile,
		WithDev:        withDev,
	}); err != nil {
		return fmt.Errorf("stopping stack: %w", err)
	}
	fmt.Fprintln(m.out, "[roadie] Done.")
	return nil
}

// Status prints running services to m.out, labelled by stack.
func (m *Manager) Status(ctx context.Context) error {
	_, err := m.container.Status(ctx)
	return err
}

func (m *Manager) waitForCheck(ctx context.Context, cfg *config.Config, check config.HealthCheck) error {
	checkFn, err := m.resolveCheckFn(ctx, cfg, check)
	if err != nil {
		return err
	}
	return m.pollUntilReady(ctx, check.Name, checkFn)
}

func (m *Manager) resolveCheckFn(ctx context.Context, cfg *config.Config, check config.HealthCheck) (func() (bool, error), error) {
	switch check.Type {
	case "http":
		return func() (bool, error) { return m.http.IsReachable(ctx, check.URL) }, nil
	case "database":
		dbCfg := providers.DBConfig{Service: cfg.Providers.Database.Service, User: check.User}
		return func() (bool, error) { return m.db.IsReady(ctx, dbCfg) }, nil
	default:
		return nil, fmt.Errorf("unknown health check type %q for %q", check.Type, check.Name)
	}
}

func (m *Manager) pollUntilReady(ctx context.Context, name string, checkFn func() (bool, error)) error {
	fmt.Fprintf(m.out, "[roadie] %-12s ", name)
	deadline := time.Now().Add(m.checkTimeout)
	for {
		if ok, _ := checkFn(); ok {
			fmt.Fprintln(m.out, "ready")
			return nil
		}
		if time.Now().After(deadline) {
			fmt.Fprintln(m.out, "TIMED OUT")
			return fmt.Errorf("health check %q timed out after %s", name, m.checkTimeout)
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(m.checkInterval):
			fmt.Fprint(m.out, ".")
		}
	}
}

func (m *Manager) printURLs(cfg *config.Config, withDev bool) {
	urls := cfg.Stack.URLs
	fmt.Fprintln(m.out)
	printURL(m.out, "App", urls.App)
	printURL(m.out, "API", urls.API)
	printURL(m.out, "Docs", urls.Docs)
	if withDev {
		printURL(m.out, "SonarQube", urls.SonarQube)
		printURL(m.out, "Structurizr", urls.Structurizr)
	}
	fmt.Fprintln(m.out)
}

func printURL(w io.Writer, label, url string) {
	if url != "" {
		fmt.Fprintf(w, "  %-12s %s\n", label+":", url)
	}
}
