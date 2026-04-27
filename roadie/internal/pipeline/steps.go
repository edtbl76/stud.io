package pipeline

import (
	"fmt"
	"path/filepath"
	"strings"
)

const frontendDir = "app/studio_frontend"
const backendDir = "app/controlroom_backend"
const gearlistDir = "app/gearlist_backend"

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

// NpmInstallStep returns a step that installs npm dependencies in the frontend
// directory, skipping the install when package-lock.json and node_modules are
// both unchanged (hash stored in .roadie-cache/npm-hash at the repo root).
// --include=dev ensures devDependencies are installed even when NODE_ENV=production.
func NpmInstallStep(root Root) ToolStep {
	r := string(root)
	cacheFile := strings.ReplaceAll(filepath.Join(r, ".roadie-cache", "npm-hash"), "'", `'"'"'`)
	cacheDir := strings.ReplaceAll(filepath.Join(r, ".roadie-cache"), "'", `'"'"'`)
	script := `set -e; ` +
		`hash=$(sha256sum package-lock.json | cut -d' ' -f1); ` +
		`if [ -d node_modules ] && [ -f '` + cacheFile + `' ] && ` +
		`[ "$(cat '` + cacheFile + `')" = "$hash" ]; then ` +
		`echo "package-lock.json unchanged — skipping npm install"; exit 0; fi; ` +
		`npm install --include=dev; ` +
		`mkdir -p '` + cacheDir + `' && echo "$hash" > '` + cacheFile + `'`
	return ToolStep{
		Name: "npm-install",
		Bin:  "bash",
		Args: []string{"-c", script},
		Dir:  filepath.Join(r, frontendDir),
		Env:  pathEnv(ResolveNode()),
	}
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
// report (used by the SonarQube scan). Extra args are appended after the
// standard flags (e.g. --testPathIgnorePatterns for the unit runner).
func JestStep(root Root, coverage bool, extraArgs ...string) ToolStep {
	r := string(root)
	args := []string{"--passWithNoTests"}
	if coverage {
		args = append(args, "--coverage", "--coverageReporters=lcov")
	}
	args = append(args, extraArgs...)
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

// goStep builds a ToolStep that runs bin with args in the gearlist_backend
// directory. Used by Go tool steps to avoid duplication.
func goStep(name, bin string, args []string, root Root) ToolStep {
	r := string(root)
	return ToolStep{
		Name: name,
		Bin:  bin,
		Args: args,
		Dir:  filepath.Join(r, gearlistDir),
		Env:  pathEnv(ResolveGoBin()),
	}
}

// GoTestStep returns a step that runs all Go tests with the race detector and
// emits a coverage profile to coverage.out in the gearlist_backend directory.
func GoTestStep(root Root) ToolStep {
	return ToolStep{
		Name: "go-test",
		Bin:  "go",
		Args: []string{"test", "-race", "-coverprofile=coverage.out", "./..."},
		Dir:  filepath.Join(string(root), gearlistDir),
		Env:  pathEnv(ResolveGoExe()),
	}
}

// GovulncheckStep returns a step that scans gearlist_backend for known Go
// vulnerabilities. Any non-zero exit code from govulncheck is treated as a
// failure, including exit code 3 (module-level findings).
func GovulncheckStep(root Root) ToolStep {
	return goStep("govulncheck", goBinPath("govulncheck"), []string{"./..."}, root)
}

// GosecStep returns a step that runs gosec static security analysis against
// gearlist_backend, excluding test files.
func GosecStep(root Root) ToolStep {
	return goStep("gosec", goBinPath("gosec"), []string{"-quiet", "./..."}, root)
}

// StaticcheckStep returns a step that runs staticcheck analysis against
// gearlist_backend.
func StaticcheckStep(root Root) ToolStep {
	return goStep("staticcheck", goBinPath("staticcheck"), []string{"./..."}, root)
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

// TrivyFrontendStep scans the studio_frontend container image.
func TrivyFrontendStep(root Root) ToolStep {
	return trivyContainerStep(root, "studio_frontend")
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
		`--exclude-files '.*/e2e/\.auth/.*' ` +
		`--exclude-files '.*/perf-reports/.*' ` +
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
