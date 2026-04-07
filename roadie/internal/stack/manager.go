package stack

import (
	"context"
	"fmt"
	"io"
	"slices"
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
	if err := m.bringUp(ctx, cfg, withDev, false); err != nil {
		return err
	}
	m.printURLs(cfg, withDev)
	return nil
}

// Build rebuilds all container images (--build --force-recreate) and waits for
// health checks. Use this instead of Start when you need a clean image rebuild.
func (m *Manager) Build(ctx context.Context, cfg *config.Config, withDev bool) error {
	fmt.Fprintln(m.out, "[roadie] Building stack (--build --force-recreate)...")
	if err := m.bringUp(ctx, cfg, withDev, true); err != nil {
		return err
	}
	m.printURLs(cfg, withDev)
	return nil
}

// bringUp is the shared implementation for Start and Build. rebuild=true sets
// --build --force-recreate on the compose up call.
func (m *Manager) bringUp(ctx context.Context, cfg *config.Config, withDev, rebuild bool) error {
	if err := m.container.Up(ctx, providers.UpConfig{
		ComposeFile:    cfg.Providers.Container.ComposeFile,
		DevComposeFile: cfg.Providers.Container.DevComposeFile,
		WithDev:        withDev,
		Build:          rebuild,
		ForceRecreate:  rebuild,
	}); err != nil {
		return fmt.Errorf("starting stack: %w", err)
	}

	var devChecks []config.HealthCheck
	if withDev {
		devChecks = cfg.Stack.DevHealthChecks
	}
	checks := slices.Concat(cfg.Stack.HealthChecks, devChecks)
	for _, check := range checks {
		if err := m.waitForCheck(ctx, cfg, check); err != nil {
			return err
		}
	}
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
	checkFn, err := m.resolveCheckFn(cfg, check)
	if err != nil {
		return err
	}
	return m.pollUntilReady(ctx, check.Name, checkFn)
}

func (m *Manager) resolveCheckFn(cfg *config.Config, check config.HealthCheck) (func(context.Context) (bool, error), error) {
	switch check.Type {
	case "http":
		return func(ctx context.Context) (bool, error) { return m.http.IsReachable(ctx, check.URL) }, nil
	case "database":
		user := check.User
		if user == "" {
			user = cfg.Providers.Database.User
		}
		dbCfg := providers.DBConfig{Service: cfg.Providers.Database.Service, User: user}
		return func(ctx context.Context) (bool, error) { return m.db.IsReady(ctx, dbCfg) }, nil
	default:
		return nil, fmt.Errorf("unknown health check type %q for %q", check.Type, check.Name)
	}
}

func (m *Manager) pollUntilReady(ctx context.Context, name string, checkFn func(context.Context) (bool, error)) error {
	fmt.Fprintf(m.out, "[roadie] %-12s ", name)
	deadline := time.Now().Add(m.checkTimeout)
	var lastErr error
	for {
		probeCtx, cancel := context.WithDeadline(ctx, deadline)
		ok, err := checkFn(probeCtx)
		cancel()
		if ok {
			fmt.Fprintln(m.out, "ready")
			return nil
		}
		lastErr = m.logNewWarning(name, err, lastErr)
		if time.Now().After(deadline) {
			fmt.Fprintln(m.out, "TIMED OUT")
			return m.timeoutError(name, lastErr)
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(m.checkInterval):
			fmt.Fprint(m.out, ".")
		}
	}
}

func isNewWarning(err, lastErr error) bool {
	return err != nil && (lastErr == nil || err.Error() != lastErr.Error())
}

func (m *Manager) logNewWarning(name string, err, lastErr error) error {
	if isNewWarning(err, lastErr) {
		fmt.Fprintf(m.out, "\n[roadie] %-12s warning: %v", name, err)
		return err
	}
	return lastErr
}

func (m *Manager) timeoutError(name string, lastErr error) error {
	if lastErr != nil {
		return fmt.Errorf("health check %q timed out after %s: %w", name, m.checkTimeout, lastErr)
	}
	return fmt.Errorf("health check %q timed out after %s", name, m.checkTimeout)
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
