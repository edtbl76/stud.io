package pipeline

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

const sonarURL = "http://localhost:1969"
const sonarDockerURL = "http://sonarqube:9000"
const sonarProjectKey = "controlroom"

// PytestCoverageStep returns a step that runs pytest with XML coverage output.
// Must be run from the repo root so the relative source path in coverage.xml
// resolves correctly under the SonarQube scanner's /usr/src mount.
func PytestCoverageStep(root Root) ToolStep {
	r := string(root)
	return ToolStep{
		Name: "pytest-coverage",
		Bin:  "python",
		Args: []string{
			"-m", "pytest",
			filepath.Join(r, backendDir, "tests"),
			"-q", "--tb=short",
			"--cov=" + backendDir,
			"--cov-config=" + filepath.Join(r, backendDir, ".coveragerc"),
			"--cov-report=xml:" + filepath.Join(r, backendDir, "coverage.xml"),
		},
		Env: pathEnv(ResolvePython()),
		Dir: r,
	}
}

// sonarDockerStep returns a step that runs the SonarQube scanner CLI in Docker.
func sonarDockerStep(root Root, token string) ToolStep {
	r := string(root)
	return ToolStep{
		Name: "sonar-scanner",
		Bin:  "docker",
		Args: []string{
			"run", "--rm",
			"--network", "dev_default",
			"--memory=16g",
			"-e", "SONAR_HOST_URL=" + sonarDockerURL,
			"-e", "SONAR_TOKEN=" + token,
			"-v", r + ":/usr/src",
			"sonarsource/sonar-scanner-cli",
			"-Dsonar.host.url=" + sonarDockerURL,
			"-Dsonar.token=" + token,
			"-Dsonar.projectKey=" + sonarProjectKey,
		},
	}
}

// fixLcovPaths prefixes bare `SF:` lines in the frontend lcov.info with the
// frontend subdirectory path. SonarQube resolves coverage paths from the
// project root (/usr/src), not from the frontend directory.
// Each SF: line is checked independently so mixed files are handled correctly.
func fixLcovPaths(root string) error {
	lcovPath := filepath.Join(root, frontendDir, "coverage", "lcov.info")
	data, err := os.ReadFile(lcovPath)
	if err != nil {
		return fmt.Errorf("reading %s: %w", lcovPath, err)
	}
	const sfPrefix = "SF:"
	const wantPrefix = "SF:app/controlroom_frontend/"
	lines := strings.Split(string(data), "\n")
	for i, line := range lines {
		if strings.HasPrefix(line, sfPrefix) && !strings.HasPrefix(line, wantPrefix) {
			lines[i] = wantPrefix + line[len(sfPrefix):]
		}
	}
	return os.WriteFile(lcovPath, []byte(strings.Join(lines, "\n")), 0644)
}

// loadSonarToken returns the SonarQube token from $SONAR_TOKEN, a .sonar-token
// file in the repo root, or a .sonar-token file in $HOME (for self-hosted runner
// workspaces where the repo root is a fresh checkout without the gitignored file).
func loadSonarToken(root string) (string, error) {
	if tok := strings.TrimSpace(os.Getenv("SONAR_TOKEN")); tok != "" {
		return tok, nil
	}
	candidates := []string{
		filepath.Join(root, ".sonar-token"),
		filepath.Join(os.Getenv("HOME"), ".sonar-token"),
	}
	for _, p := range candidates {
		if data, err := os.ReadFile(p); err == nil {
			return strings.TrimSpace(string(data)), nil
		}
	}
	return "", fmt.Errorf("SONAR_TOKEN not set and .sonar-token not found in %s or $HOME", root)
}

// RunSonarScan runs the full SonarQube pipeline:
// jest coverage → pytest coverage → fix lcov → docker scanner → (optional) gate.
func RunSonarScan(ctx context.Context, root Root, gate bool, out io.Writer) error {
	r := string(root)

	fmt.Fprintln(out, "[sonar] Generating frontend coverage (jest)...")
	if err := New(JestStep(root, true)).RunSequential(ctx, out); err != nil {
		return err
	}

	fmt.Fprintln(out, "[sonar] Generating backend coverage (pytest)...")
	if err := New(PytestCoverageStep(root)).RunSequential(ctx, out); err != nil {
		return err
	}

	if err := fixLcovPaths(r); err != nil {
		return fmt.Errorf("sonar: %w", err)
	}

	token, err := loadSonarToken(r)
	if err != nil {
		return fmt.Errorf("sonar: %w", err)
	}

	fmt.Fprintln(out, "[sonar] Running scanner...")
	if err := New(sonarDockerStep(root, token)).RunSequential(ctx, out); err != nil {
		return err
	}

	fmt.Fprintf(out, "[sonar] Dashboard: %s/dashboard?id=%s\n", sonarURL, sonarProjectKey)

	if gate {
		return checkSonarGate(ctx, sonarURL, token, out)
	}
	return nil
}

// ScanFlags controls which scan suites run.
type ScanFlags struct {
	Sonar, Trivy, Secrets, Headers, Gate bool
}

// AllScanFlags returns ScanFlags with all suites enabled.
func AllScanFlags(gate bool) ScanFlags {
	return ScanFlags{Sonar: true, Trivy: true, Secrets: true, Headers: true, Gate: gate}
}

// RunScan runs all selected security scan suites in parallel and returns
// aggregated results. Trivy backend and frontend share a cache lock so they
// run sequentially within a single goroutine; sonar, secrets, and headers each
// run in their own goroutine concurrently alongside trivy.
func RunScan(ctx context.Context, root Root, flags ScanFlags, out io.Writer) ([]StepResult, error) {
	type task struct {
		name string
		run  func() error
	}
	var tasks []task

	if flags.Sonar {
		tasks = append(tasks, task{"sonar", func() error {
			return RunSonarScan(ctx, root, flags.Gate, out)
		}})
	}
	if flags.Trivy {
		b, f := TrivyBackendStep(root), TrivyFrontendStep(root)
		tasks = append(tasks, task{"trivy", func() error {
			if err := b.Run(ctx, out); err != nil {
				return err
			}
			return f.Run(ctx, out)
		}})
	}
	if flags.Secrets {
		s := DetectSecretsStep(root)
		tasks = append(tasks, task{s.Name, func() error { return s.Run(ctx, out) }})
	}
	if flags.Headers {
		h := SecurityHeadersStep(root)
		tasks = append(tasks, task{h.Name, func() error { return h.Run(ctx, out) }})
	}

	results := make([]StepResult, len(tasks))
	var wg sync.WaitGroup
	for i, t := range tasks {
		wg.Add(1)
		go func(i int, t task) {
			defer wg.Done()
			start := time.Now()
			results[i] = StepResult{Name: t.name, Err: t.run(), Duration: time.Since(start)}
		}(i, t)
	}
	wg.Wait()
	return results, collectErrors(results)
}

type gateCondition struct {
	metric, actual, threshold string
}

// sonarGateChecker holds the stable HTTP context for CE task polling and gate
// status queries, eliminating the need to pass client/baseURL/token per call.
type sonarGateChecker struct {
	client  *http.Client
	baseURL string
	token   string
}

// checkSonarGate polls the SonarQube API until the CE analysis task completes,
// then checks the quality gate status.
func checkSonarGate(ctx context.Context, baseURL, token string, out io.Writer) error {
	lw := NewLabelWriter("sonar-gate", out)
	checker := sonarGateChecker{
		client:  &http.Client{Timeout: 15 * time.Second},
		baseURL: baseURL,
		token:   token,
	}

	fmt.Fprint(lw, "Waiting for analysis task")
	if err := checker.waitForCETask(ctx, lw); err != nil {
		return err
	}

	status, conditions, err := checker.fetchGateStatus(ctx)
	if err != nil {
		return err
	}

	fmt.Fprintf(lw, "\nQuality gate: %s\n", status)
	if status == "OK" {
		return lw.Flush()
	}
	for _, c := range conditions {
		fmt.Fprintf(lw, "  FAIL: %s = %s (threshold: %s)\n", c.metric, c.actual, c.threshold)
	}
	return fmt.Errorf("quality gate %s", status)
}

const maxConsecutiveCEErrors = 3

// advanceCEPoll processes one poll iteration result. Returns done=true when the
// CE task has finished. Increments *consecutiveErrors on failure and returns an
// error once the limit is exceeded; resets the counter on success.
func advanceCEPoll(pending bool, pollErr error, consecutiveErrors *int) (done bool, err error) {
	if pollErr == nil {
		*consecutiveErrors = 0
		return !pending, nil
	}
	*consecutiveErrors++
	if *consecutiveErrors > maxConsecutiveCEErrors {
		return false, fmt.Errorf("CE task poll failed %d consecutive times: %w", *consecutiveErrors, pollErr)
	}
	return false, nil
}

// waitForCETask polls until no IN_PROGRESS/PENDING CE tasks remain.
// Transient network or decode errors are tolerated up to maxConsecutiveCEErrors
// consecutive failures; beyond that the poll is aborted with an error.
func (c sonarGateChecker) waitForCETask(ctx context.Context, out io.Writer) error {
	consecutiveErrors := 0
	for i := 0; i < 100; i++ {
		pending, pollErr := c.isCETaskPending(ctx)
		done, err := advanceCEPoll(pending, pollErr, &consecutiveErrors)
		if err != nil {
			return err
		}
		if done {
			return nil
		}
		fmt.Fprint(out, ".")
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(3 * time.Second):
		}
	}
	return fmt.Errorf("CE task did not complete after 5 minutes")
}

func (c sonarGateChecker) isCETaskPending(ctx context.Context) (bool, error) {
	url := c.baseURL + "/api/ce/component?component=" + sonarProjectKey
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	req.Header.Set("Authorization", "Bearer "+c.token)

	resp, err := c.client.Do(req)
	if err != nil {
		return false, fmt.Errorf("polling CE task: %w", err)
	}
	defer resp.Body.Close()

	var body struct {
		Queue   []struct{ Status string } `json:"queue"`
		Current struct{ Status string }   `json:"current"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return false, fmt.Errorf("decoding CE task response: %w", err)
	}
	for _, t := range body.Queue {
		if t.Status == "IN_PROGRESS" || t.Status == "PENDING" {
			return true, nil
		}
	}
	return body.Current.Status == "IN_PROGRESS" || body.Current.Status == "PENDING", nil
}

func (c sonarGateChecker) fetchGateStatus(ctx context.Context) (string, []gateCondition, error) {
	url := c.baseURL + "/api/qualitygates/project_status?projectKey=" + sonarProjectKey
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	req.Header.Set("Authorization", "Bearer "+c.token)

	resp, err := c.client.Do(req)
	if err != nil {
		return "", nil, fmt.Errorf("querying quality gate: %w", err)
	}
	defer resp.Body.Close()

	var body struct {
		ProjectStatus struct {
			Status     string `json:"status"`
			Conditions []struct {
				Status         string `json:"status"`
				MetricKey      string `json:"metricKey"`
				ActualValue    string `json:"actualValue"`
				ErrorThreshold string `json:"errorThreshold"`
			} `json:"conditions"`
		} `json:"projectStatus"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return "", nil, fmt.Errorf("parsing gate response: %w", err)
	}

	var failed []gateCondition
	for _, c := range body.ProjectStatus.Conditions {
		if c.Status == "ERROR" {
			failed = append(failed, gateCondition{c.MetricKey, c.ActualValue, c.ErrorThreshold})
		}
	}
	return body.ProjectStatus.Status, failed, nil
}
