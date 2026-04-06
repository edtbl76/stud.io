package pipeline

import (
	"path/filepath"
)

const frontendDir = "app/controlroom_frontend"
const backendDir = "app/controlroom_backend"

// TscStep returns a step that runs tsc --noEmit against the frontend project.
// Equivalent to scripts/run-tsc.sh.
func TscStep(root string) ToolStep {
	return ToolStep{
		Name: "tsc",
		Bin:  filepath.Join(root, frontendDir, "node_modules", ".bin", "tsc"),
		Args: []string{
			"--project", filepath.Join(root, frontendDir, "tsconfig.json"),
			"--noEmit",
		},
		Env: pathEnv(ResolveNode()),
	}
}

// JestStep returns a step that runs Jest. Pass coverage=true to emit an lcov
// report (used by the SonarQube scan). Equivalent to scripts/run-jest.sh.
func JestStep(root string, coverage bool) ToolStep {
	args := []string{"--passWithNoTests"}
	if coverage {
		args = append(args, "--coverage", "--coverageReporters=lcov")
	}
	return ToolStep{
		Name: "jest",
		Bin:  filepath.Join(root, frontendDir, "node_modules", ".bin", "jest"),
		Args: args,
		Dir:  filepath.Join(root, frontendDir),
		Env:  pathEnv(ResolveNode()),
	}
}

// PytestStep returns a step that runs pytest. Extra args are appended after the
// test directory (e.g., "-k", "test_name" to filter). Equivalent to
// scripts/run-pytest.sh.
func PytestStep(root string, extraArgs ...string) ToolStep {
	args := []string{"-m", "pytest", filepath.Join(root, backendDir, "tests"), "-q", "--tb=short"}
	args = append(args, extraArgs...)
	return ToolStep{
		Name: "pytest",
		Bin:  "python",
		Args: args,
		Env:  pathEnv(ResolvePython()),
	}
}

// BanditStep returns a step that runs bandit static analysis against the
// backend. Equivalent to scripts/run-bandit.sh.
func BanditStep(root string) ToolStep {
	return ToolStep{
		Name: "bandit",
		Bin:  "python",
		Args: []string{
			"-m", "bandit",
			"-r", filepath.Join(root, backendDir),
			"--exclude", filepath.Join(root, backendDir, "tests"),
			"-c", filepath.Join(root, ".bandit"),
			"-ll", "-q",
		},
		Env: pathEnv(ResolvePython()),
	}
}

// PipAuditStep returns a step that audits Python dependencies for known CVEs.
// Equivalent to scripts/run-pip-audit.sh.
func PipAuditStep(root string) ToolStep {
	return ToolStep{
		Name: "pip-audit",
		Bin:  "python",
		Args: []string{
			"-m", "pip_audit",
			"-r", filepath.Join(root, backendDir, "requirements.txt"),
			"--ignore-vuln", "CVE-2024-23342",
		},
		Env: pathEnv(ResolvePython()),
	}
}

// NpmAuditStep returns a step that runs npm audit at critical severity.
// Equivalent to scripts/run-npm-audit.sh.
func NpmAuditStep(root string) ToolStep {
	return ToolStep{
		Name: "npm-audit",
		Bin:  "npm",
		Args: []string{"audit", "--audit-level=critical"},
		Dir:  filepath.Join(root, frontendDir),
		Env:  pathEnv(ResolveNode()),
	}
}

// TrivyStep returns a step that scans a single container image with Trivy via
// docker run. imageRef should be the image SHA or tag returned by
// `docker inspect <container> --format '{{.Image}}'`. Equivalent to the scan()
// function inside scripts/run-trivy.sh.
func TrivyStep(root, imageRef string) ToolStep {
	return ToolStep{
		Name: "trivy",
		Bin:  "docker",
		Args: []string{
			"run", "--rm",
			"-v", "/var/run/docker.sock:/var/run/docker.sock",
			"-v", "trivy-cache:/root/.cache/trivy",
			"-v", filepath.Join(root, ".trivyignore") + ":/src/.trivyignore:ro",
			"ghcr.io/aquasecurity/trivy:latest",
			"image",
			"--severity", "HIGH,CRITICAL",
			"--exit-code", "1",
			"--no-progress",
			"--ignorefile", "/src/.trivyignore",
			imageRef,
		},
	}
}

// E2EStep returns a step that runs the full sharded E2E suite via
// scripts/test-e2e.sh. The script manages its own shard setup, parallel
// Playwright runs, and container teardown — it is not decomposed into
// individual ToolSteps until Phase 5.
func E2EStep(root string) ToolStep {
	return ToolStep{
		Name: "e2e",
		Bin:  "bash",
		Args: []string{filepath.Join(root, "scripts", "test-e2e.sh")},
		Dir:  root,
	}
}

// ScanStep returns a step that runs the full security scan suite via
// scripts/test-scan.sh (SonarQube, Trivy, detect-secrets, headers). The script
// manages coverage generation and gate polling — it is not decomposed until
// Phase 5.
func ScanStep(root string) ToolStep {
	return ToolStep{
		Name: "scan",
		Bin:  "bash",
		Args: []string{filepath.Join(root, "scripts", "test-scan.sh")},
		Dir:  root,
	}
}

// PerfStep returns a step that runs the full performance suite via
// scripts/test-perf.sh (benchmarks, k6, Lighthouse). The script manages the
// backend container, production Next.js build, and frontend lifecycle — it is
// not decomposed until Phase 5.
func PerfStep(root string) ToolStep {
	return ToolStep{
		Name: "perf",
		Bin:  "bash",
		Args: []string{filepath.Join(root, "scripts", "test-perf.sh")},
		Dir:  root,
	}
}
