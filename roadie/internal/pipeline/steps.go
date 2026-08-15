package pipeline

import (
	"fmt"
	"path/filepath"
	"strings"
)

const frontendDir = "app/studio_frontend"
const backendDir = "app/controlroom_backend"
const gearlistDir = "app/gearlist_backend"
const pluginScannerDir = "app/plugin_scanner"

// Root is the filesystem root of the monorepo, used to resolve tool paths.
type Root string

// backendTestImage is the dev/test image (the controlroom_backend_test service in
// docker-compose.dev.yml). It carries the Python interpreter + pinned wheels +
// lint/security tooling in the same Debian base we deploy to — running the Python
// unit lane here instead of the host interpreter keeps tests in the deploy
// environment and avoids host glibc/pyenv problems.
const backendTestImage = "dev-controlroom_backend_test:latest"

// containerize reroutes a host Python ToolStep to run inside backendTestImage
// instead of the host interpreter. The whole repo is bind-mounted at its own path
// so the step's absolute-path args resolve unchanged; the working dir is the
// backend package so pytest's `from main import ...` imports resolve. When needsDB
// is set the run shares studio_db's network namespace so conftest's
// localhost:5432 reaches the database. The image supplies the interpreter and
// wheels; the source comes from the mount, so tests run against the current tree.
func containerize(step ToolStep, root Root, needsDB bool) ToolStep {
	abs, err := filepath.Abs(string(root))
	if err != nil {
		abs = string(root)
	}
	// The repo is mounted at its own absolute path and the working dir is the
	// repo root, so the step's root-relative args resolve exactly as they do on
	// the host (roadie runs from the repo root).
	workdir := abs
	if step.Dir != "" {
		if d, e := filepath.Abs(step.Dir); e == nil {
			workdir = d
		}
	}
	dockerArgs := []string{"run", "--rm"}
	if needsDB {
		dockerArgs = append(dockerArgs, "--network", "container:studio_db")
	}
	dockerArgs = append(dockerArgs,
		"-v", abs+":"+abs,
		"-w", workdir,
		backendTestImage,
		step.Bin,
	)
	dockerArgs = append(dockerArgs, step.Args...)
	return ToolStep{Name: step.Name, Bin: "docker", Args: dockerArgs}
}

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
	return containerize(ToolStep{
		Name: "pytest",
		Bin:  "python",
		Args: args,
	}, root, true)
}

// BanditStep returns a step that runs bandit static analysis against the backend.
func BanditStep(root Root) ToolStep {
	r := string(root)
	return containerize(ToolStep{
		Name: "bandit",
		Bin:  "python",
		Args: []string{
			"-m", "bandit",
			"-r", filepath.Join(r, backendDir),
			"--exclude", filepath.Join(r, backendDir, "tests"),
			"-c", filepath.Join(r, ".bandit"),
			"-ll", "-q",
		},
	}, root, false)
}

// RuffStep returns a step that runs ruff lint against the backend.
func RuffStep(root Root) ToolStep {
	r := string(root)
	return containerize(ToolStep{
		Name: "ruff",
		Bin:  "python",
		Args: []string{"-m", "ruff", "check", filepath.Join(r, backendDir), "--quiet"},
	}, root, false)
}

// PipAuditStep returns a step that audits Python dependencies for known CVEs.
func PipAuditStep(root Root) ToolStep {
	r := string(root)
	return containerize(ToolStep{
		Name: "pip-audit",
		Bin:  "python",
		Args: []string{
			"-m", "pip_audit",
			"-r", filepath.Join(r, backendDir, "requirements.txt"),
			// Pre-existing suppression: ecdsa timing attack — app uses HS256 only.
			"--ignore-vuln", "CVE-2024-23342",
			// Pre-existing suppression: stale finding, resolved upstream.
			"--ignore-vuln", "PYSEC-2025-183",
			// aiohttp — required only by langchain-community (global dev tool, not in app tree).
			"--ignore-vuln", "CVE-2026-34513",
			"--ignore-vuln", "CVE-2026-34514",
			"--ignore-vuln", "CVE-2026-34515",
			"--ignore-vuln", "CVE-2026-34516",
			"--ignore-vuln", "CVE-2026-34517",
			"--ignore-vuln", "CVE-2026-34518",
			"--ignore-vuln", "CVE-2026-34519",
			"--ignore-vuln", "CVE-2026-34520",
			"--ignore-vuln", "CVE-2026-34525",
			"--ignore-vuln", "CVE-2026-22815",
			// orjson — required only by langgraph-sdk/langsmith (global dev tools, not in app tree).
			"--ignore-vuln", "CVE-2025-67221",
			// langchain-core/langchain-text-splitters/langgraph/langsmith — global AI dev tools, not app deps.
			"--ignore-vuln", "CVE-2026-26013",
			"--ignore-vuln", "CVE-2026-40087",
			"--ignore-vuln", "CVE-2026-44843",
			"--ignore-vuln", "PYSEC-2026-77",
			"--ignore-vuln", "PYSEC-2026-83",
			"--ignore-vuln", "CVE-2026-41182",
			"--ignore-vuln", "CVE-2026-45134",
			// marimo — global notebook tool, not an app dep.
			"--ignore-vuln", "CVE-2026-39987",
			// pymdown-extensions — required only by marimo (global dev tool, not in app tree).
			"--ignore-vuln", "CVE-2026-46338",
			// pip — the package manager itself, not an app dependency.
			"--ignore-vuln", "CVE-2026-3219",
			"--ignore-vuln", "CVE-2026-6357",
		},
	}, root, false)
}

// NpmAuditStep returns a step that audits npm dependencies for known CVEs.
func NpmAuditStep(root Root) ToolStep {
	return npmStep("npm-audit", []string{"audit", "--audit-level=critical"}, root)
}

// goModuleStep builds a ToolStep running bin with args in the given absolute directory.
func goModuleStep(name, bin string, args []string, dir string) ToolStep {
	return ToolStep{
		Name: name,
		Bin:  bin,
		Args: args,
		Dir:  dir,
		Env:  pathEnv(ResolveGoBin()),
	}
}

// goStep builds a ToolStep in the gearlist_backend directory.
func goStep(name, bin string, args []string, root Root) ToolStep {
	return goModuleStep(name, bin, args, filepath.Join(string(root), gearlistDir))
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

// trivyImage pins the Trivy scanner to an immutable digest (trivy 0.72.0) rather
// than the mutable :latest tag, so scan behavior is reproducible and a silent
// upstream retag cannot change what the gate enforces. This is the exact image
// the suppression files were validated against. Bump deliberately alongside a
// re-validation of .trivyignore.{backend,frontend}.yaml.
const trivyImage = "ghcr.io/aquasecurity/trivy:0.72.0@sha256:cffe3f5161a47a6823fbd23d985795b3ed72a4c806da4c4df16266c02accdd6f"

// trivyContainerStep returns a step that resolves a running container's image
// SHA via docker inspect at runtime, then scans it with Trivy for HIGH and
// CRITICAL CVEs. Uses bash -c to chain inspect + trivy without a staging file.
// ignoreFile is the image-specific suppression file (relative to root) so a
// suppression scoped to one image can never mask a finding in the other.
func trivyContainerStep(root Root, container, ignoreFile string) ToolStep {
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
			`-v '%s/%s:/src/%s:ro' `+
			`%s image `+
			`--severity HIGH,CRITICAL --exit-code 1 --no-progress `+
			`--ignorefile /src/%s "$img"`,
		container, rSafe, ignoreFile, ignoreFile, trivyImage, ignoreFile,
	)
	return ToolStep{
		Name: "trivy-" + container,
		Bin:  "bash",
		Args: []string{"-c", script},
	}
}

// TrivyBackendStep scans the controlroom_backend container image with the
// backend-scoped suppression file.
func TrivyBackendStep(root Root) ToolStep {
	return trivyContainerStep(root, "controlroom_backend", ".trivyignore.backend.yaml")
}

// TrivyFrontendStep scans the studio_frontend container image with the
// frontend-scoped suppression file.
func TrivyFrontendStep(root Root) ToolStep {
	return trivyContainerStep(root, "studio_frontend", ".trivyignore.frontend.yaml")
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

// GoTestPluginScannerStep runs all plugin_scanner tests with the race detector.
func GoTestPluginScannerStep(root Root) ToolStep {
	return ToolStep{
		Name: "go-test-scanner",
		Bin:  "go",
		Args: []string{"test", "-race", "-coverprofile=coverage.out", "./..."},
		Dir:  filepath.Join(string(root), pluginScannerDir),
		Env:  pathEnv(ResolveGoExe()),
	}
}

// GoVetPluginScannerStep runs go vet against plugin_scanner.
func GoVetPluginScannerStep(root Root) ToolStep {
	return goModuleStep("go-vet-scanner", "go", []string{"vet", "./..."}, filepath.Join(string(root), pluginScannerDir))
}

// GovulncheckPluginScannerStep scans plugin_scanner for known Go vulnerabilities.
func GovulncheckPluginScannerStep(root Root) ToolStep {
	return goModuleStep("govulncheck-scanner", goBinPath("govulncheck"), []string{"./..."}, filepath.Join(string(root), pluginScannerDir))
}

// GosecPluginScannerStep runs gosec static analysis against plugin_scanner.
func GosecPluginScannerStep(root Root) ToolStep {
	return goModuleStep("gosec-scanner", goBinPath("gosec"), []string{"-quiet", "./..."}, filepath.Join(string(root), pluginScannerDir))
}

// StaticcheckPluginScannerStep runs staticcheck against plugin_scanner.
func StaticcheckPluginScannerStep(root Root) ToolStep {
	return goModuleStep("staticcheck-scanner", goBinPath("staticcheck"), []string{"./..."}, filepath.Join(string(root), pluginScannerDir))
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
