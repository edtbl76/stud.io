package pipeline

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"
)

const sonarURL = "http://192.168.1.243:30969"       // B127: central weyland Sonar (LAN NodePort), was localhost:1969
const sonarDockerURL = "http://192.168.1.243:30969" // B127: was http://sonarqube:9000 on dev_default (local Sonar retired)
const sonarProjectKey = "controlroom"

// PytestCoverageStep returns a step that runs pytest with XML coverage output,
// containerized into backendTestImage (like PytestStep) rather than on the host
// interpreter. The host pyenv build segfaults under coverage instrumentation
// combined with rapidfuzz's AVX2 native extension; the deploy-image interpreter
// does not. The whole repo is bind-mounted at its own absolute path, so
// coverage.xml written to backendDir lands on the host for the SonarQube
// scanner's /usr/src mount. needsDB shares studio_db's netns for conftest.
// Dir is the repo root so the relative --cov source path resolves as it does
// for the scanner.
func PytestCoverageStep(root Root) ToolStep {
	r := string(root)
	return containerize(ToolStep{
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
		Dir: r,
	}, root, true)
}

// sonarDockerStep returns a step that runs the SonarQube scanner CLI in Docker.
func sonarDockerStep(root Root, token string) ToolStep {
	r := string(root)
	return ToolStep{
		Name: "sonar-scanner",
		Bin:  "docker",
		Args: []string{
			"run", "--rm",
			"--memory=16g",
			"-e", "SONAR_HOST_URL=" + sonarDockerURL,
			"-e", "SONAR_TOKEN=" + token, // skipcq: SCT-A000
			"-v", r + ":/usr/src",
			"sonarsource/sonar-scanner-cli",
			"-Dsonar.host.url=" + sonarDockerURL,
			"-Dsonar.token=" + token, // skipcq: SCT-A000
			"-Dsonar.projectKey=" + sonarProjectKey,
		},
	}
}

// reownFrontendCoverageStep returns a containerized step that chowns the frontend
// coverage directory back to the invoking user. The containerized jest step writes
// coverage/lcov.info as root (container uid 0) into the bind-mounted repo, so the
// host-side fixLcovPaths (which rewrites the file as the agent user) hits EPERM.
// Running chown as root inside the image — the same identity that wrote the file —
// is permitted and hands ownership back to the host user.
func reownFrontendCoverageStep(root Root) ToolStep {
	r := string(root)
	owner := fmt.Sprintf("%d:%d", os.Getuid(), os.Getgid())
	return containerizeNode(ToolStep{
		Name: "reown-coverage",
		Bin:  "chown",
		Args: []string{"-R", owner, filepath.Join(r, frontendDir, "coverage")},
	}, root)
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
	const wantPrefix = "SF:app/studio_frontend/"
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

	// jest ran containerized as root; hand the coverage dir back to the agent user
	// so the host-side fixLcovPaths below can rewrite lcov.info.
	if err := New(reownFrontendCoverageStep(root)).RunSequential(ctx, out); err != nil {
		return fmt.Errorf("sonar: reowning frontend coverage: %w", err)
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
	var scanLog bytes.Buffer // the gate needs the CE task id the scanner prints
	if err := New(sonarDockerStep(root, token)).RunSequential(ctx, io.MultiWriter(out, &scanLog)); err != nil {
		return err
	}

	fmt.Fprintf(out, "[sonar] Dashboard: %s/dashboard?id=%s\n", sonarURL, sonarProjectKey)

	if !gate {
		return nil
	}
	taskID, err := ceTaskIDFromScannerOutput(scanLog.String())
	if err != nil {
		return err
	}
	return checkSonarGate(ctx, sonarURL, token, taskID, out)
}

// ScanFlags controls which scan suites run.
type ScanFlags struct {
	Sonar, Trivy, Secrets, Headers, Gate bool
	Govulncheck, Gosec, Staticcheck      bool
}

// AllScanFlags returns ScanFlags with all suites enabled.
func AllScanFlags(gate bool) ScanFlags {
	return ScanFlags{
		Sonar: true, Trivy: true, Secrets: true, Headers: true, Gate: gate,
		Govulncheck: true, Gosec: true, Staticcheck: true,
	}
}

type scanTask struct {
	name string
	run  func() error
}

// sonarTask returns a scan task that runs the full SonarQube pipeline.
func sonarTask(ctx context.Context, root Root, flags ScanFlags, out io.Writer) scanTask {
	return scanTask{"sonar", func() error { return RunSonarScan(ctx, root, flags.Gate, out) }}
}

// trivyTask returns a scan task that runs backend then frontend Trivy scans sequentially.
func trivyTask(ctx context.Context, root Root, out io.Writer) scanTask {
	b, f := TrivyBackendStep(root), TrivyFrontendStep(root)
	return scanTask{"trivy", func() error {
		if err := b.Run(ctx, out); err != nil {
			return err
		}
		return f.Run(ctx, out)
	}}
}

// stepTask wraps a single ToolStep as a scanTask.
func stepTask(ctx context.Context, s ToolStep, out io.Writer) scanTask {
	return scanTask{s.Name, func() error { return s.Run(ctx, out) }}
}

// enabledSimpleSteps returns only the single-step scan tools that are flagged on.
// Sonar and Trivy are excluded because they require special orchestration.
func enabledSimpleSteps(root Root, flags ScanFlags) []ToolStep {
	type entry struct {
		ok   bool
		step ToolStep
	}
	candidates := []entry{
		{flags.Secrets, DetectSecretsStep(root)},
		{flags.Headers, SecurityHeadersStep(root)},
		{flags.Govulncheck, GovulncheckStep(root)},
		{flags.Gosec, GosecStep(root)},
		{flags.Staticcheck, StaticcheckStep(root)},
	}
	var steps []ToolStep
	for _, c := range candidates {
		if c.ok {
			steps = append(steps, c.step)
		}
	}
	return steps
}

// buildScanTasks assembles the ordered list of scan tasks from flags.
func buildScanTasks(ctx context.Context, root Root, flags ScanFlags, out io.Writer) []scanTask {
	var tasks []scanTask
	if flags.Sonar {
		tasks = append(tasks, sonarTask(ctx, root, flags, out))
	}
	if flags.Trivy {
		tasks = append(tasks, trivyTask(ctx, root, out))
	}
	for _, s := range enabledSimpleSteps(root, flags) {
		tasks = append(tasks, stepTask(ctx, s, out))
	}
	return tasks
}

// RunScan runs all selected security scan suites in parallel and returns
// aggregated results. Trivy backend and frontend share a cache lock so they
// run sequentially within a single goroutine; sonar, secrets, and headers each
// run in their own goroutine concurrently alongside trivy.
func RunScan(ctx context.Context, root Root, flags ScanFlags, out io.Writer) ([]StepResult, error) {
	tasks := buildScanTasks(ctx, root, flags, out)
	results := make([]StepResult, len(tasks))
	var wg sync.WaitGroup
	for i, t := range tasks {
		wg.Add(1)
		go func(i int, t scanTask) {
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
	client    *http.Client
	baseURL   string
	token     string
	pollEvery time.Duration // 0 means the default, 3s
}

// ceTaskIDRe matches the scanner's "More about the report processing at <host>/api/ce/task?id=<id>" line.
var ceTaskIDRe = regexp.MustCompile(`/api/ce/task\?id=([A-Za-z0-9_-]+)`)

// ceTaskIDFromScannerOutput returns the CE task id of the analysis the scanner just uploaded (the last one printed).
func ceTaskIDFromScannerOutput(s string) (string, error) {
	m := ceTaskIDRe.FindAllStringSubmatch(s, -1)
	if len(m) == 0 {
		return "", fmt.Errorf("sonar gate: no CE task id in the scanner output, so the analysis to gate is unknown")
	}
	return m[len(m)-1][1], nil
}

// checkSonarGate waits for THIS run's analysis (CE task taskID) to finish, then checks the quality gate of that
// analysis. Why (2026-11-10): it used to wait for "no pending task on the project" and read the project's latest
// status; right after the upload the task was not queued yet, so the wait returned at once and the gate judged the
// PREVIOUS analysis (stud.io CI #19 passed 4 new issues; #21 failed clean code).
func checkSonarGate(ctx context.Context, baseURL, token, taskID string, out io.Writer) error {
	lw := NewLabelWriter("sonar-gate", out)
	checker := sonarGateChecker{
		client:  &http.Client{Timeout: 15 * time.Second},
		baseURL: baseURL,
		token:   token,
	}

	fmt.Fprintf(lw, "Waiting for analysis task %s", taskID)
	analysisID, err := checker.waitForCETask(ctx, taskID, lw)
	if err != nil {
		return err
	}

	status, conditions, err := checker.fetchGateStatus(ctx, analysisID)
	if err != nil {
		return err
	}
	if status == "" {
		return fmt.Errorf("sonar gate: empty quality gate status for analysis %s", analysisID)
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

// waitForCETask polls CE task taskID until it finishes and returns its analysisId. FAILED/CANCELED, or SUCCESS with no
// analysisId, is an error. Transient network or decode errors are tolerated up to maxConsecutiveCEErrors consecutive
// failures; beyond that the poll is aborted with an error.
func (c sonarGateChecker) waitForCETask(ctx context.Context, taskID string, out io.Writer) (string, error) {
	every := c.pollEvery
	if every == 0 {
		every = 3 * time.Second
	}
	consecutiveErrors := 0
	for i := 0; i < 100; i++ {
		status, analysisID, pollErr := c.ceTaskStatus(ctx, taskID)
		pending := status == "PENDING" || status == "IN_PROGRESS"
		done, err := advanceCEPoll(pending, pollErr, &consecutiveErrors)
		if err != nil {
			return "", err
		}
		if done {
			return analysisOf(taskID, status, analysisID)
		}
		fmt.Fprint(out, ".")
		select {
		case <-ctx.Done():
			return "", ctx.Err()
		case <-time.After(every):
		}
	}
	return "", fmt.Errorf("CE task %s did not complete after 100 polls", taskID)
}

// analysisOf turns a finished CE task into the analysis id to gate on, failing closed on anything but a SUCCESS that
// names its analysis.
func analysisOf(taskID, status, analysisID string) (string, error) {
	if status != "SUCCESS" {
		return "", fmt.Errorf("sonar analysis task %s ended %s", taskID, status)
	}
	if analysisID == "" {
		return "", fmt.Errorf("sonar analysis task %s succeeded but returned no analysisId", taskID)
	}
	return analysisID, nil
}

func (c sonarGateChecker) ceTaskStatus(ctx context.Context, taskID string) (string, string, error) {
	url := c.baseURL + "/api/ce/task?id=" + taskID
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	req.Header.Set("Authorization", "Bearer "+c.token)

	resp, err := c.client.Do(req)
	if err != nil {
		return "", "", fmt.Errorf("polling CE task: %w", err)
	}
	defer resp.Body.Close()

	var body struct {
		Task struct {
			Status     string `json:"status"`
			AnalysisID string `json:"analysisId"`
		} `json:"task"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return "", "", fmt.Errorf("decoding CE task response: %w", err)
	}
	if body.Task.Status == "" {
		return "", "", fmt.Errorf("CE task %s: response carried no status", taskID)
	}
	return body.Task.Status, body.Task.AnalysisID, nil
}

func (c sonarGateChecker) fetchGateStatus(ctx context.Context, analysisID string) (string, []gateCondition, error) {
	url := c.baseURL + "/api/qualitygates/project_status?analysisId=" + analysisID
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
