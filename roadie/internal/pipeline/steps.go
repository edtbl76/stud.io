package pipeline

import (
	"fmt"
	"path/filepath"
	"strings"
)

const frontendDir = "app/controlroom_frontend"
const backendDir = "app/controlroom_backend"

// Root is the filesystem root of the monorepo, used to resolve tool paths.
type Root string

// ImageRef is a Docker image reference (SHA or tag) for container scanning.
type ImageRef string

// npmStep builds a ToolStep that runs npm with the given args in the frontend
// directory. Used by NpmInstallStep and NpmAuditStep to avoid duplication.
func npmStep(name string, args []string, root Root) ToolStep {
	r := string(root)
	return ToolStep{
		Name: name,
		Bin:  "npm",
		Args: args,
		Dir:  filepath.Join(r, frontendDir),
		Env:  pathEnv(ResolveNode()),
	}
}

// NpmInstallStep returns a step that runs npm install in the frontend directory.
// --include=dev ensures devDependencies (e.g. jest, tsc) are installed even
// when NODE_ENV=production is set in the environment.
func NpmInstallStep(root Root) ToolStep {
	return npmStep("npm-install", []string{"install", "--include=dev"}, root)
}

// TscStep returns a step that runs tsc --noEmit against the frontend project.
func TscStep(root Root) ToolStep {
	r := string(root)
	return ToolStep{
		Name: "tsc",
		Bin:  filepath.Join(r, frontendDir, "node_modules", ".bin", "tsc"),
		Args: []string{
			"--project", filepath.Join(r, frontendDir, "tsconfig.json"),
			"--noEmit",
		},
		Env: pathEnv(ResolveNode()),
	}
}

// JestStep returns a step that runs Jest. Pass coverage=true to emit an lcov
// report (used by the SonarQube scan).
func JestStep(root Root, coverage bool) ToolStep {
	r := string(root)
	args := []string{"--passWithNoTests"}
	if coverage {
		args = append(args, "--coverage", "--coverageReporters=lcov")
	}
	return ToolStep{
		Name: "jest",
		Bin:  filepath.Join("node_modules", ".bin", "jest"),
		Args: args,
		Dir:  filepath.Join(r, frontendDir),
		Env:  pathEnv(ResolveNode()),
	}
}

// PytestStep returns a step that runs pytest. Extra args are appended after the
// test directory (e.g., "-k", "test_name" to filter).
func PytestStep(root Root, extraArgs ...string) ToolStep {
	r := string(root)
	args := []string{"-m", "pytest", filepath.Join(r, backendDir, "tests"), "-q", "--tb=short"}
	args = append(args, extraArgs...)
	return ToolStep{
		Name: "pytest",
		Bin:  "python",
		Args: args,
		Env:  pathEnv(ResolvePython()),
	}
}

// BanditStep returns a step that runs bandit static analysis against the backend.
func BanditStep(root Root) ToolStep {
	r := string(root)
	return ToolStep{
		Name: "bandit",
		Bin:  "python",
		Args: []string{
			"-m", "bandit",
			"-r", filepath.Join(r, backendDir),
			"--exclude", filepath.Join(r, backendDir, "tests"),
			"-c", filepath.Join(r, ".bandit"),
			"-ll", "-q",
		},
		Env: pathEnv(ResolvePython()),
	}
}

// RuffStep returns a step that runs ruff lint against the backend.
func RuffStep(root Root) ToolStep {
	r := string(root)
	return ToolStep{
		Name: "ruff",
		Bin:  "python",
		Args: []string{"-m", "ruff", "check", filepath.Join(r, backendDir), "--quiet"},
		Env:  pathEnv(ResolvePython()),
	}
}

// PipAuditStep returns a step that audits Python dependencies for known CVEs.
func PipAuditStep(root Root) ToolStep {
	r := string(root)
	return ToolStep{
		Name: "pip-audit",
		Bin:  "python",
		Args: []string{
			"-m", "pip_audit",
			"-r", filepath.Join(r, backendDir, "requirements.txt"),
			"--ignore-vuln", "CVE-2024-23342",
		},
		Env: pathEnv(ResolvePython()),
	}
}

// NpmAuditStep returns a step that audits npm dependencies for known CVEs.
func NpmAuditStep(root Root) ToolStep {
	return npmStep("npm-audit", []string{"audit", "--audit-level=critical"}, root)
}

// TrivyStep returns a step that scans a single container image with Trivy via
// docker run. image should be the image SHA or tag returned by
// `docker inspect <container> --format '{{.Image}}'`. Equivalent to the scan()
// function inside scripts/run-trivy.sh.
func TrivyStep(root Root, image ImageRef) ToolStep {
	r := string(root)
	return ToolStep{
		Name: "trivy",
		Bin:  "docker",
		Args: []string{
			"run", "--rm",
			"-v", "/var/run/docker.sock:/var/run/docker.sock",
			"-v", "trivy-cache:/root/.cache/trivy",
			"-v", filepath.Join(r, ".trivyignore") + ":/src/.trivyignore:ro",
			"ghcr.io/aquasecurity/trivy:latest",
			"image",
			"--severity", "HIGH,CRITICAL",
			"--exit-code", "1",
			"--no-progress",
			"--ignorefile", "/src/.trivyignore",
			string(image),
		},
	}
}

// trivyContainerStep returns a step that resolves a running container's image
// SHA via docker inspect at runtime, then scans it with Trivy for HIGH and
// CRITICAL CVEs. Uses bash -c to chain inspect + trivy without a staging file.
func trivyContainerStep(root Root, container string) ToolStep {
	r := string(root)
	// Escape any single quotes in r so it can be safely embedded in a
	// single-quoted shell word (bash '"'"' idiom).
	rSafe := strings.ReplaceAll(r, "'", `'"'"'`)
	script := fmt.Sprintf(
		`set -e; `+
			`img=$(docker inspect %s --format '{{.Image}}'); `+
			`docker run --rm `+
			`-v /var/run/docker.sock:/var/run/docker.sock `+
			`-v trivy-cache:/root/.cache/trivy `+
			`-v '%s/.trivyignore:/src/.trivyignore:ro' `+
			`ghcr.io/aquasecurity/trivy:latest image `+
			`--severity HIGH,CRITICAL --exit-code 1 --no-progress `+
			`--ignorefile /src/.trivyignore "$img"`,
		container, rSafe,
	)
	return ToolStep{
		Name: "trivy-" + container,
		Bin:  "bash",
		Args: []string{"-c", script},
	}
}

// TrivyBackendStep scans the controlroom_backend container image.
func TrivyBackendStep(root Root) ToolStep {
	return trivyContainerStep(root, "controlroom_backend")
}

// TrivyFrontendStep scans the controlroom_frontend container image.
func TrivyFrontendStep(root Root) ToolStep {
	return trivyContainerStep(root, "controlroom_frontend")
}

// DetectSecretsStep runs detect-secrets scan and diffs the result against
// .secrets.baseline, exiting non-zero if any new finding is present.
// detect-secrets scan --baseline only imports settings and always exits 0,
// so we scan without --baseline and compare via an inline Python script.
func DetectSecretsStep(root Root) ToolStep {
	r := string(root)
	rSafe := strings.ReplaceAll(r, "'", `'"'"'`)
	script := `set -eo pipefail; ` +
		`cd '` + rSafe + `'; ` +
		`detect-secrets scan ` +
		`--exclude-files 'node_modules/.*' ` +
		`--exclude-files '\.git/.*' ` +
		`--exclude-files '.*\.lock$' ` +
		`--exclude-files 'package-lock\.json' ` +
		`--exclude-files '.*\.next/.*' ` +
		`--exclude-files '.*__pycache__.*' ` +
		`--exclude-files '\.secrets\.baseline' ` +
		`--exclude-files 'structurizr/workspace\.json' ` +
		`> /tmp/secrets_current.json; ` +
		`python3 -c '` +
		`import json, sys; ` +
		`cur = json.load(open("/tmp/secrets_current.json")); ` +
		`base = json.load(open(".secrets.baseline")); ` +
		`added = [f + ":" + str(r["line_number"]) + " [" + r["type"] + "]" ` +
		`for f, findings in cur.get("results", {}).items() ` +
		`for r in findings if r not in base.get("results", {}).get(f, [])]; ` +
		`[print("[secrets] New secrets detected (not in baseline):"), ` +
		`[print("[secrets]   " + s) for s in added], ` +
		`print("[secrets] Run: detect-secrets scan --baseline .secrets.baseline"), ` +
		`sys.exit(1)] if added else ` +
		`print("[secrets] No new secrets detected (" + str(sum(len(v) for v in cur.get("results", {}).values())) + " findings, all baselined).")' `
	return ToolStep{
		Name: "detect-secrets",
		Bin:  "bash",
		Args: []string{"-c", script},
		Dir:  r,
	}
}

// SecurityHeadersStep runs pytest against the HTTP security header assertions.
// Requires the production stack to be running at https://localhost:2112.
func SecurityHeadersStep(root Root) ToolStep {
	r := string(root)
	return ToolStep{
		Name: "security-headers",
		Bin:  "python",
		Args: []string{
			"-m", "pytest",
			filepath.Join(r, "tests", "security", "test_security_headers.py"),
			"-v",
		},
		Env: pathEnv(ResolvePython()),
	}
}
