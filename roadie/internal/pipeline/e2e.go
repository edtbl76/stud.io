package pipeline

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"
)

// E2EConfig holds everything the E2E runner needs. Construct via NewE2EConfig
// in the commands layer to keep pipeline independent of the config package.
type E2EConfig struct {
	Shards                int
	DevComposeFile        string
	BackendComposeProject string
	BackendService        string
	BackendInternalPort   int
	BackendBasePort       int
	FrontendBasePort      int
	DBContainer           string
	DBUser                string
	DBPassword            string
	DBSource              string
	GearlistService       string
	GearlistPort          int
	GearlistInternalPort  int
}

// healthTarget groups the parameters for waitForShards.
type healthTarget struct {
	shards   int
	basePort int
	path     string
}

// shardRunner encapsulates the per-shard Playwright execution context.
type shardRunner struct {
	cfg         E2EConfig
	frontendDir string
	nodeDir     string
}

// RunE2E orchestrates the full sharded E2E suite: build image → provision DBs
// → start backends → start frontends → run Playwright shards in parallel →
// teardown.
func RunE2E(ctx context.Context, cfg E2EConfig, root Root, out io.Writer) error {
	r := string(root)
	lw := NewLabelWriter("e2e", out)

	var frontendProcs []*os.Process
	cleanup := func() {
		fmt.Fprintln(lw, "Tearing down...")
		for _, p := range frontendProcs {
			p.Kill() //nolint — best-effort cleanup
		}
		removeBackendShards(cfg)
		removeShardNextDirs(cfg, r)
		restoreDevBackend(cfg, r)
		lw.Flush() //nolint
	}
	defer cleanup()

	if err := setupBackendShards(ctx, cfg, r, lw); err != nil {
		return err
	}

	procs, err := startFrontendShards(ctx, cfg, r, lw)
	frontendProcs = procs // assign before error check so deferred cleanup kills partial starts
	if err != nil {
		return err
	}

	if err := waitForShards(ctx, healthTarget{cfg.Shards, cfg.FrontendBasePort, ""}, lw); err != nil {
		return fmt.Errorf("frontend health: %w", err)
	}

	return runPlaywrightShards(ctx, cfg, r, lw)
}

// devComposeCmd encapsulates the compose file and project for a single docker
// compose invocation, removing the need to pass cfg/root/out on every call.
type devComposeCmd struct {
	cfg  E2EConfig
	root string
}

func (d devComposeCmd) run(ctx context.Context, out io.Writer, verb string, extra ...string) error {
	args := append([]string{
		"compose",
		"-f", filepath.Join(d.root, d.cfg.DevComposeFile),
		"-p", d.cfg.BackendComposeProject,
		verb,
	}, extra...)
	cmd := exec.CommandContext(ctx, "docker", args...)
	cmd.Stdout = out
	cmd.Stderr = out
	return cmd.Run()
}

// setupBackendShards builds the backend image, stops the dev backend to free
// its port, provisions shard databases, starts backend containers, and waits
// for all backend health endpoints to respond.
func setupBackendShards(ctx context.Context, cfg E2EConfig, root string, out io.Writer) error {
	dc := devComposeCmd{cfg, root}

	fmt.Fprintln(out, "Building backend image...")
	if err := dc.run(ctx, out, "build", cfg.BackendService); err != nil {
		return err
	}
	fmt.Fprintln(out, "Building gearlist backend image...")
	if err := dc.run(ctx, out, "build", "--no-cache", cfg.GearlistService); err != nil {
		return err
	}
	if err := provisionShardDBs(ctx, cfg, out); err != nil {
		return err
	}
	if err := startGearlistE2EBackend(ctx, cfg, root, out); err != nil {
		return err
	}
	if err := startBackendShards(ctx, cfg, root, out); err != nil {
		return err
	}
	return waitForShards(ctx, healthTarget{cfg.Shards, cfg.BackendBasePort, "/health"}, out)
}

func gearlistE2EContainer(cfg E2EConfig) string { return cfg.GearlistService + "_e2e" }

func startGearlistE2EBackend(ctx context.Context, cfg E2EConfig, root string, out io.Writer) error {
	container := gearlistE2EContainer(cfg)
	fmt.Fprintf(out, "Starting gearlist backend (%s on port %d)...\n", container, cfg.GearlistPort)
	exec.CommandContext(ctx, "docker", "rm", "-f", container).Run() //nolint
	db := fmt.Sprintf("%s_0", cfg.DBSource)
	cmd := exec.CommandContext(ctx, "docker", "compose",
		"-f", filepath.Join(root, cfg.DevComposeFile),
		"-p", cfg.BackendComposeProject,
		"run", "-d",
		"--name", container,
		"-p", fmt.Sprintf("%d:%d", cfg.GearlistPort, cfg.GearlistInternalPort),
		"-e", "DB_NAME="+db,
		cfg.GearlistService,
	)
	cmd.Stdout = out
	cmd.Stderr = out
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("starting gearlist e2e backend: %w", err)
	}
	url := fmt.Sprintf("http://localhost:%d/health", cfg.GearlistPort)
	return waitForHTTP(ctx, url, 30, 2*time.Second)
}

func restoreDevBackend(cfg E2EConfig, root string) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	devComposeCmd{cfg, root}.run(ctx, io.Discard, "up", "-d", cfg.BackendService) //nolint — best-effort
}

// dbIdentRe is the strict allowlist for PostgreSQL database identifiers:
// letters, digits, underscores only; starts with a letter or underscore;
// max 63 characters (PostgreSQL's NAMEDATALEN - 1).
var dbIdentRe = regexp.MustCompile(`^[a-zA-Z_][a-zA-Z0-9_]{0,62}$`)

// validateDBIdentifier rejects any name that could escape safe SQL quoting.
// Validation is a first line of defence; all SQL also uses psql variables and
// format('%I',...) so the database itself handles final quoting.
func validateDBIdentifier(name string) error {
	if !dbIdentRe.MatchString(name) {
		return fmt.Errorf("unsafe database identifier %q: must match [a-zA-Z_][a-zA-Z0-9_]* (max 63 chars)", name)
	}
	return nil
}

// provisionShardDBs terminates connections to the source DB, then creates N
// clone databases using CREATE DATABASE … WITH TEMPLATE.
// Identifiers are validated by validateDBIdentifier before use, so direct
// interpolation into SQL is safe (the regex permits only [a-zA-Z_][a-zA-Z0-9_]*).
func provisionShardDBs(ctx context.Context, cfg E2EConfig, out io.Writer) error {
	fmt.Fprintf(out, "Provisioning %d test databases...\n", cfg.Shards)

	if err := validateDBIdentifier(cfg.DBSource); err != nil {
		return err
	}
	if err := validateDBIdentifier(cfg.DBUser); err != nil {
		return err
	}

	terminateSQL := fmt.Sprintf(
		"SELECT pg_terminate_backend(pid) FROM pg_stat_activity"+
			" WHERE datname = '%s' AND pid <> pg_backend_pid();",
		cfg.DBSource,
	)
	if err := dockerPsql(ctx, cfg, "postgres", terminateSQL); err != nil {
		return fmt.Errorf("terminating source connections: %w", err)
	}

	for i := 0; i < cfg.Shards; i++ {
		db := fmt.Sprintf("%s_%d", cfg.DBSource, i)
		if err := provisionOneShard(ctx, cfg, db); err != nil {
			return err
		}
	}
	return nil
}

// provisionOneShard terminates connections, drops if present, and clones the
// source DB into db. format('%I',...) handles identifier quoting in DDL.
func provisionOneShard(ctx context.Context, cfg E2EConfig, db string) error {
	if err := validateDBIdentifier(db); err != nil {
		return err
	}

	terminateSQL := fmt.Sprintf(
		"SELECT pg_terminate_backend(pid) FROM pg_stat_activity"+
			" WHERE datname = '%s' AND pid <> pg_backend_pid();",
		db,
	)
	if err := dockerPsql(ctx, cfg, "postgres", terminateSQL); err != nil {
		return err
	}

	// DROP DATABASE and CREATE DATABASE cannot run inside a DO block or
	// transaction. Use direct SQL with pre-validated identifiers.
	dropSQL := fmt.Sprintf("DROP DATABASE IF EXISTS %s;", db)
	if err := dockerPsql(ctx, cfg, "postgres", dropSQL); err != nil {
		return err
	}

	// Terminate template connections immediately before CREATE so the window
	// for new connections to appear is as small as possible.
	terminateTemplateSQL := fmt.Sprintf(
		"SELECT pg_terminate_backend(pid) FROM pg_stat_activity"+
			" WHERE datname = '%s' AND pid <> pg_backend_pid();",
		cfg.DBSource,
	)
	if err := dockerPsql(ctx, cfg, "postgres", terminateTemplateSQL); err != nil {
		return err
	}

	createSQL := fmt.Sprintf(
		"CREATE DATABASE %s WITH TEMPLATE %s OWNER %s;",
		db, cfg.DBSource, cfg.DBUser,
	)
	return dockerPsql(ctx, cfg, "postgres", createSQL)
}

// dockerPsql runs a SQL statement inside the database container via psql -c.
// All identifiers in sql must be pre-validated by validateDBIdentifier.
// Stderr from psql is captured and appended to the error for easier diagnosis.
func dockerPsql(ctx context.Context, cfg E2EConfig, db, sql string) error {
	var stderr bytes.Buffer
	cmd := exec.CommandContext(ctx, "docker", "exec",
		"-e", "PGPASSWORD="+cfg.DBPassword,
		cfg.DBContainer,
		"psql", "-U", cfg.DBUser, "-d", db, "-c", sql, "-q",
	)
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		if msg := strings.TrimSpace(stderr.String()); msg != "" {
			return fmt.Errorf("%w: %s", err, msg)
		}
		return err
	}
	return nil
}

func startBackendShards(ctx context.Context, cfg E2EConfig, root string, out io.Writer) error {
	fmt.Fprintf(out, "Starting %d backend containers...\n", cfg.Shards)
	for i := 0; i < cfg.Shards; i++ {
		port := cfg.BackendBasePort + i
		db := fmt.Sprintf("%s_%d", cfg.DBSource, i)
		container := fmt.Sprintf("%s_%d", cfg.BackendService, i)

		// Remove any stale container first.
		exec.CommandContext(ctx, "docker", "rm", "-f", container).Run() //nolint

		gearlistURL := fmt.Sprintf("http://%s:%d", gearlistE2EContainer(cfg), cfg.GearlistInternalPort)
		cmd := exec.CommandContext(ctx, "docker", "compose",
			"-f", filepath.Join(root, cfg.DevComposeFile),
			"-p", cfg.BackendComposeProject,
			"run", "-d",
			"--name", container,
			"-p", fmt.Sprintf("%d:%d", port, cfg.BackendInternalPort),
			"-e", "DB_NAME="+db,
			"-e", "GEARLIST_URL="+gearlistURL,
			cfg.BackendService,
		)
		cmd.Stdout = out
		cmd.Stderr = out
		if err := cmd.Run(); err != nil {
			return fmt.Errorf("starting backend shard %d: %w", i, err)
		}
	}
	return nil
}

// waitForShards polls health endpoints for all shards in target.
// target.path is the URL path to GET (e.g. "/health" or "" for the root).
func waitForShards(ctx context.Context, target healthTarget, out io.Writer) error {
	for i := 0; i < target.shards; i++ {
		port := target.basePort + i
		url := fmt.Sprintf("http://localhost:%d%s", port, target.path)
		fmt.Fprintf(out, "Waiting for shard %d on port %d...\n", i, port)
		if err := waitForHTTP(ctx, url, 30, 2*time.Second); err != nil {
			return fmt.Errorf("shard %d: %w", i, err)
		}
	}
	return nil
}

// waitForHTTP polls url until it responds with a 2xx status code, up to
// maxAttempts tries with pause between each. Matches curl -f semantics: any
// non-2xx (including redirects and 4xx) is treated as not-yet-ready.
func waitForHTTP(ctx context.Context, url string, maxAttempts int, pause time.Duration) error {
	client := &http.Client{Timeout: 5 * time.Second}
	var lastStatus int
	for attempt := 0; attempt < maxAttempts; attempt++ {
		req, _ := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
		if resp, err := client.Do(req); err == nil {
			lastStatus = resp.StatusCode
			resp.Body.Close()
			if resp.StatusCode >= 200 && resp.StatusCode < 300 {
				return nil
			}
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(pause):
		}
	}
	if lastStatus != 0 {
		return fmt.Errorf("%s did not become healthy after %d attempts (last status: %d)", url, maxAttempts, lastStatus)
	}
	return fmt.Errorf("%s did not become healthy after %d attempts (no response)", url, maxAttempts)
}

func startFrontendShards(ctx context.Context, cfg E2EConfig, root string, out io.Writer) ([]*os.Process, error) {
	fmt.Fprintf(out, "Starting %d frontend processes...\n", cfg.Shards)
	// Run npm install with a raw writer to avoid LabelWriter stalling on \r-only
	// npm progress lines that never flush — npm CI output mixes \r and \n.
	if err := NpmInstallStep(Root(root)).RunRaw(ctx, out); err != nil {
		return nil, fmt.Errorf("npm install for e2e: %w", err)
	}
	return launchFrontendProcs(ctx, cfg, root)
}

func launchFrontendProcs(ctx context.Context, cfg E2EConfig, root string) ([]*os.Process, error) {
	procs := make([]*os.Process, 0, cfg.Shards)
	for i := range cfg.Shards {
		proc, err := startOneFrontendShard(ctx, cfg, root, i)
		if err != nil {
			return procs, err
		}
		procs = append(procs, proc)
	}
	return procs, nil
}

func startOneFrontendShard(ctx context.Context, cfg E2EConfig, root string, shard int) (*os.Process, error) {
	frontendDir := filepath.Join(root, "app", "studio_frontend")
	nodeDir := ResolveNode()
	port := cfg.FrontendBasePort + shard
	cmd := exec.CommandContext(ctx, "npx", "next", "dev",
		"-p", fmt.Sprintf("%d", port), "-H", "127.0.0.1",
	)
	cmd.Dir = frontendDir
	cmd.Env = append(os.Environ(),
		"NEXT_DIST_DIR=.next-e2e-"+fmt.Sprintf("%d", shard),
		fmt.Sprintf("BACKEND_URL=http://localhost:%d", cfg.BackendBasePort+shard),
	)
	if nodeDir != "" {
		cmd.Env = append(cmd.Env, "PATH="+nodeDir+":"+os.Getenv("PATH"))
	}
	killPortProcess(port)
	logFile, err := os.Create(fmt.Sprintf("/tmp/e2e-frontend-%d.log", shard))
	if err != nil {
		return nil, fmt.Errorf("creating log for frontend shard %d: %w", shard, err)
	}
	cmd.Stdout = logFile
	cmd.Stderr = logFile
	if err := cmd.Start(); err != nil {
		logFile.Close()
		return nil, fmt.Errorf("starting frontend shard %d: %w", shard, err)
	}
	logFile.Close() // parent's copy; child process holds its own inherited fd
	return cmd.Process, nil
}

// runPlaywrightShards runs all Playwright shards in parallel using goroutines.
func runPlaywrightShards(ctx context.Context, cfg E2EConfig, root string, out io.Writer) error {
	sr := shardRunner{
		cfg:         cfg,
		frontendDir: filepath.Join(root, "app", "studio_frontend"),
		nodeDir:     ResolveNode(),
	}

	type result struct {
		shard int
		err   error
	}
	ch := make(chan result, cfg.Shards)
	var wg sync.WaitGroup

	for i := 0; i < cfg.Shards; i++ {
		wg.Add(1)
		go func(shard int) {
			defer wg.Done()
			err := sr.run(ctx, shard, out)
			ch <- result{shard, err}
		}(i)
	}

	wg.Wait()
	close(ch)

	var failed int
	for r := range ch {
		if r.err != nil {
			fmt.Fprintf(out, "[e2e] Shard %d/%d FAILED: %v\n", r.shard+1, cfg.Shards, r.err)
			failed++
		} else {
			fmt.Fprintf(out, "[e2e] Shard %d/%d passed.\n", r.shard+1, cfg.Shards)
		}
	}
	if failed > 0 {
		return fmt.Errorf("%d/%d E2E shards failed", failed, cfg.Shards)
	}
	return nil
}

func (sr shardRunner) run(ctx context.Context, shard int, out io.Writer) error {
	port := sr.cfg.FrontendBasePort + shard
	shardArg := fmt.Sprintf("%d/%d", shard+1, sr.cfg.Shards)

	cmd := exec.CommandContext(ctx, "npx", "playwright", "test",
		"--config", "playwright.test.config.ts",
		"--shard="+shardArg,
	)
	cmd.Dir = sr.frontendDir
	cmd.Env = os.Environ()
	if sr.nodeDir != "" {
		cmd.Env = append(cmd.Env, "PATH="+sr.nodeDir+":"+os.Getenv("PATH"))
	}
	cmd.Env = append(cmd.Env, fmt.Sprintf("BASE_URL=http://localhost:%d", port))
	cmd.Env = append(cmd.Env, fmt.Sprintf("E2E_AUTH_STATE=e2e/.auth/state-%d.json", shard))

	lw := NewLabelWriter(fmt.Sprintf("shard %s", shardArg), out)
	cmd.Stdout = lw
	cmd.Stderr = lw
	err := cmd.Run()
	lw.Flush() //nolint
	return err
}

func removeBackendShards(cfg E2EConfig) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	for i := 0; i < cfg.Shards; i++ {
		container := fmt.Sprintf("%s_%d", cfg.BackendService, i)
		exec.CommandContext(ctx, "docker", "rm", "-f", container).Run() //nolint
	}
	exec.CommandContext(ctx, "docker", "rm", "-f", gearlistE2EContainer(cfg)).Run() //nolint
}

func removeShardNextDirs(cfg E2EConfig, root string) {
	frontendDir := filepath.Join(root, "app", "studio_frontend")
	for i := 0; i < cfg.Shards; i++ {
		os.RemoveAll(filepath.Join(frontendDir, fmt.Sprintf(".next-e2e-%d", i)))
		os.Remove(filepath.Join(frontendDir, fmt.Sprintf("e2e/.auth/state-%d.json", i))) //nolint
	}
}

// killPortProcess sends SIGKILL to any process bound to port via fuser.
// Errors are silently ignored — this is best-effort pre-start cleanup.
func killPortProcess(port int) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	// fuser exits non-zero when no process holds the port; that is fine.
	exec.CommandContext(ctx, "fuser", "-k", fmt.Sprintf("%d/tcp", port)).Run() //nolint
}
