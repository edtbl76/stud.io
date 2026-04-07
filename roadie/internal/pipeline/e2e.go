package pipeline

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
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

	if err := buildBackendImage(ctx, cfg, r, lw); err != nil {
		return err
	}
	if err := stopDevBackend(ctx, cfg, r, lw); err != nil {
		return err
	}
	if err := provisionShardDBs(ctx, cfg, lw); err != nil {
		return err
	}
	if err := startBackendShards(ctx, cfg, r, lw); err != nil {
		return err
	}
	if err := waitForShards(ctx, cfg.Shards, cfg.BackendBasePort, "/health", lw); err != nil {
		return fmt.Errorf("backend health: %w", err)
	}

	procs, err := startFrontendShards(ctx, cfg, r, lw)
	if err != nil {
		return err
	}
	frontendProcs = procs

	if err := waitForShards(ctx, cfg.Shards, cfg.FrontendBasePort, "", lw); err != nil {
		return fmt.Errorf("frontend health: %w", err)
	}

	return runPlaywrightShards(ctx, cfg, r, lw)
}

func buildBackendImage(ctx context.Context, cfg E2EConfig, root string, out io.Writer) error {
	fmt.Fprintln(out, "Building backend image...")
	cmd := exec.CommandContext(ctx, "docker", "compose",
		"-f", filepath.Join(root, cfg.DevComposeFile),
		"-p", cfg.BackendComposeProject,
		"build", cfg.BackendService,
	)
	cmd.Stdout = out
	cmd.Stderr = out
	return cmd.Run()
}

func stopDevBackend(ctx context.Context, cfg E2EConfig, root string, out io.Writer) error {
	fmt.Fprintf(out, "Stopping dev backend (freeing port %d)...\n", cfg.BackendBasePort)
	cmd := exec.CommandContext(ctx, "docker", "compose",
		"-f", filepath.Join(root, cfg.DevComposeFile),
		"-p", cfg.BackendComposeProject,
		"stop", cfg.BackendService,
	)
	cmd.Stdout = out
	cmd.Stderr = out
	return cmd.Run()
}

func restoreDevBackend(cfg E2EConfig, root string) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "docker", "compose",
		"-f", filepath.Join(root, cfg.DevComposeFile),
		"-p", cfg.BackendComposeProject,
		"up", "-d", cfg.BackendService,
	)
	cmd.Run() //nolint — best-effort
}

// provisionShardDBs terminates connections to the source DB, then creates N
// clone databases using CREATE DATABASE … WITH TEMPLATE.
func provisionShardDBs(ctx context.Context, cfg E2EConfig, out io.Writer) error {
	fmt.Fprintf(out, "Provisioning %d test databases...\n", cfg.Shards)
	terminateSQL := fmt.Sprintf(
		"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '%s' AND pid <> pg_backend_pid();",
		cfg.DBSource,
	)
	if err := dockerPsql(ctx, cfg, "postgres", terminateSQL); err != nil {
		return fmt.Errorf("terminating source connections: %w", err)
	}
	for i := 0; i < cfg.Shards; i++ {
		db := fmt.Sprintf("%s_%d", cfg.DBSource, i)
		dropSQL := fmt.Sprintf("DROP DATABASE IF EXISTS %s;", db)
		createSQL := fmt.Sprintf("CREATE DATABASE %s WITH TEMPLATE %s OWNER %s;", db, cfg.DBSource, cfg.DBUser)
		terminateShardSQL := fmt.Sprintf(
			"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '%s' AND pid <> pg_backend_pid();",
			db,
		)
		if err := dockerPsql(ctx, cfg, "postgres", terminateShardSQL); err != nil {
			return err
		}
		if err := dockerPsql(ctx, cfg, "postgres", dropSQL); err != nil {
			return err
		}
		if err := dockerPsql(ctx, cfg, "postgres", createSQL); err != nil {
			return err
		}
	}
	return nil
}

// dockerPsql runs a single SQL statement inside the database container.
func dockerPsql(ctx context.Context, cfg E2EConfig, db, sql string) error {
	cmd := exec.CommandContext(ctx, "docker", "exec",
		"-e", "PGPASSWORD="+cfg.DBPassword,
		cfg.DBContainer,
		"psql", "-U", cfg.DBUser, "-d", db, "-c", sql, "-q",
	)
	return cmd.Run()
}

func startBackendShards(ctx context.Context, cfg E2EConfig, root string, out io.Writer) error {
	fmt.Fprintf(out, "Starting %d backend containers...\n", cfg.Shards)
	for i := 0; i < cfg.Shards; i++ {
		port := cfg.BackendBasePort + i
		db := fmt.Sprintf("%s_%d", cfg.DBSource, i)
		container := fmt.Sprintf("%s_%d", cfg.BackendService, i)

		// Remove any stale container first.
		exec.CommandContext(ctx, "docker", "rm", "-f", container).Run() //nolint

		cmd := exec.CommandContext(ctx, "docker", "compose",
			"-f", filepath.Join(root, cfg.DevComposeFile),
			"-p", cfg.BackendComposeProject,
			"run", "-d",
			"--name", container,
			"-p", fmt.Sprintf("%d:%d", port, cfg.BackendInternalPort),
			"-e", "DB_NAME="+db,
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

// waitForShards polls health endpoints for all shards.
// path is the URL path to GET (e.g. "/health" or "" for the root).
func waitForShards(ctx context.Context, shards, basePort int, path string, out io.Writer) error {
	for i := 0; i < shards; i++ {
		port := basePort + i
		url := fmt.Sprintf("http://localhost:%d%s", port, path)
		fmt.Fprintf(out, "Waiting for shard %d on port %d...\n", i, port)
		if err := waitForHTTP(ctx, url, 30, 2*time.Second); err != nil {
			return fmt.Errorf("shard %d: %w", i, err)
		}
	}
	return nil
}

// waitForHTTP polls url until it responds 2xx, up to maxAttempts tries.
func waitForHTTP(ctx context.Context, url string, maxAttempts int, pause time.Duration) error {
	client := &http.Client{Timeout: 5 * time.Second}
	for attempt := 0; attempt < maxAttempts; attempt++ {
		req, _ := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
		if resp, err := client.Do(req); err == nil {
			resp.Body.Close()
			if resp.StatusCode < 500 {
				return nil
			}
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(pause):
		}
	}
	return fmt.Errorf("%s did not become healthy after %d attempts", url, maxAttempts)
}

func startFrontendShards(ctx context.Context, cfg E2EConfig, root string, out io.Writer) ([]*os.Process, error) {
	frontendDir := filepath.Join(root, "app", "controlroom_frontend")
	nodeDir := ResolveNode()
	fmt.Fprintf(out, "Starting %d frontend processes...\n", cfg.Shards)

	procs := make([]*os.Process, 0, cfg.Shards)
	for i := 0; i < cfg.Shards; i++ {
		port := cfg.FrontendBasePort + i
		backendPort := cfg.BackendBasePort + i

		cmd := exec.CommandContext(ctx, "npx", "next", "dev",
			"-p", fmt.Sprintf("%d", port), "-H", "127.0.0.1",
		)
		cmd.Dir = frontendDir
		cmd.Env = append(os.Environ(),
			"NEXT_DIST_DIR=.next-e2e-"+fmt.Sprintf("%d", i),
			fmt.Sprintf("BACKEND_URL=http://localhost:%d", backendPort),
		)
		if nodeDir != "" {
			cmd.Env = append(cmd.Env, "PATH="+nodeDir+":"+os.Getenv("PATH"))
		}
		logFile, _ := os.Create(fmt.Sprintf("/tmp/e2e-frontend-%d.log", i))
		cmd.Stdout = logFile
		cmd.Stderr = logFile

		if err := cmd.Start(); err != nil {
			return procs, fmt.Errorf("starting frontend shard %d: %w", i, err)
		}
		procs = append(procs, cmd.Process)
	}
	return procs, nil
}

// runPlaywrightShards runs all Playwright shards in parallel using goroutines.
func runPlaywrightShards(ctx context.Context, cfg E2EConfig, root string, out io.Writer) error {
	frontendDir := filepath.Join(root, "app", "controlroom_frontend")
	nodeDir := ResolveNode()

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
			err := runOneShard(ctx, cfg, frontendDir, nodeDir, shard, out)
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

func runOneShard(ctx context.Context, cfg E2EConfig, frontendDir, nodeDir string, shard int, out io.Writer) error {
	port := cfg.FrontendBasePort + shard
	shardArg := fmt.Sprintf("%d/%d", shard+1, cfg.Shards)

	cmd := exec.CommandContext(ctx, "npx", "playwright", "test",
		"--config", "playwright.test.config.ts",
		"--shard="+shardArg,
	)
	cmd.Dir = frontendDir
	cmd.Env = os.Environ()
	if nodeDir != "" {
		cmd.Env = append(cmd.Env, "PATH="+nodeDir+":"+os.Getenv("PATH"))
	}
	cmd.Env = append(cmd.Env, fmt.Sprintf("BASE_URL=http://localhost:%d", port))

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
}

func removeShardNextDirs(cfg E2EConfig, root string) {
	frontendDir := filepath.Join(root, "app", "controlroom_frontend")
	for i := 0; i < cfg.Shards; i++ {
		os.RemoveAll(filepath.Join(frontendDir, fmt.Sprintf(".next-e2e-%d", i)))
	}
}
