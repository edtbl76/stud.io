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

// containerizeIn reroutes a host ToolStep to run inside the given image instead of
// on the host. The whole repo is bind-mounted at its own absolute path so the
// step's absolute-path args resolve unchanged; the working dir is the step's Dir
// (or the repo root when Dir is empty), so root-relative args resolve exactly as
// they do on the host. extraDockerArgs are inserted before the image (e.g.
// --network for the DB, or cache -v mounts). The step's Bin becomes the
// in-container command (it must be on the image PATH) and its Env is dropped — the
// image supplies the toolchain; the source comes from the mount, so the step runs
// against the current tree.
func containerizeIn(step ToolStep, root Root, image string, extraDockerArgs ...string) ToolStep {
	abs, err := filepath.Abs(string(root))
	if err != nil {
		abs = string(root)
	}
	workdir := abs
	if step.Dir != "" {
		if d, e := filepath.Abs(step.Dir); e == nil {
			workdir = d
		}
	}
	dockerArgs := append([]string{"run", "--rm"}, extraDockerArgs...)
	dockerArgs = append(dockerArgs, "-v", abs+":"+abs, "-w", workdir, image, step.Bin)
	dockerArgs = append(dockerArgs, step.Args...)
	return ToolStep{Name: step.Name, Bin: "docker", Args: dockerArgs}
}

// containerize reroutes a host Python ToolStep into backendTestImage. When needsDB
// is set the run shares studio_db's network namespace so conftest's localhost:5432
// reaches the database.
func containerize(step ToolStep, root Root, needsDB bool) ToolStep {
	var extra []string
	if needsDB {
		extra = []string{"--network", "container:studio_db"}
	}
	return containerizeIn(step, root, backendTestImage, extra...)
}

// frontendTestImage is the Node toolchain image for the JS/TS unit lane (the
// frontend_test service in docker-compose.dev.yml). node:24 (LTS), not the deploy
// node:20 — jest never runs in deploy, and jest.config.ts needs Node's native TS
// type-stripping (23.6+) to parse, which node:20 lacks. node_modules is installed at
// runtime into the bind-mounted repo by the containerized npm-install step, so
// tsc/jest find it.
const frontendTestImage = "dev-studio_frontend_test:latest"

// npmCacheMounts persist npm's download cache across runs (named volume) so installs
// aren't re-fetching every time.
var npmCacheMounts = []string{"-v", "roadie-npm-cache:/root/.npm"}

// containerizeNode reroutes a host JS/TS ToolStep into frontendTestImage. The Bin is
// NOT rebased (unlike the Go lane): tsc/jest are invoked via their node_modules/.bin
// path, which resolves in the bind-mounted repo, while npm and bash are on the image
// PATH.
func containerizeNode(step ToolStep, root Root) ToolStep {
	return containerizeIn(step, root, frontendTestImage, npmCacheMounts...)
}

// npmStep builds a ToolStep that runs npm with the given args in the frontend
// directory, containerized into frontendTestImage.
func npmStep(name string, args []string, root Root) ToolStep {
	r := string(root)
	return containerizeNode(ToolStep{
		Name: name,
		Bin:  "npm",
		Args: args,
		Dir:  filepath.Join(r, frontendDir),
	}, root)
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
	return containerizeNode(ToolStep{
		Name: "npm-install",
		Bin:  "bash",
		Args: []string{"-c", script},
		Dir:  filepath.Join(r, frontendDir),
	}, root)
}

// TscStep returns a step that runs tsc --noEmit against the frontend project.
func TscStep(root Root) ToolStep {
	r := string(root)
	return containerizeNode(ToolStep{
		Name: "tsc",
		Bin:  filepath.Join(r, frontendDir, "node_modules", ".bin", "tsc"),
		Args: []string{
			"--project", filepath.Join(r, frontendDir, "tsconfig.json"),
			"--noEmit",
		},
	}, root)
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
	return containerizeNode(ToolStep{
		Name: "jest",
		Bin:  filepath.Join("node_modules", ".bin", "jest"),
		Args: args,
		Dir:  filepath.Join(r, frontendDir),
	}, root)
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

// goTestImage is the shared Go toolchain image (the go_test service in
// docker-compose.dev.yml): the golang base (go + gcc for `go test -race`) plus
// govulncheck, gosec, and staticcheck. Both Go modules (gearlist_backend and
// plugin_scanner) run their unit lane here instead of the host toolchain, keeping
// tests in a controlled environment and off host-toolchain drift.
const goTestImage = "dev-go_test:latest"

// goCacheMounts persist the Go build and module caches across runs (named volumes)
// so the containerized Go lane does not re-download and re-compile every run.
var goCacheMounts = []string{
	"-v", "roadie-go-build:/root/.cache/go-build",
	"-v", "roadie-go-mod:/go/pkg/mod",
}

// containerizeGo reroutes a host Go ToolStep into goTestImage. The Bin is reduced
// to its base name (go, govulncheck, gosec, staticcheck) — all on PATH in the image
// — so the host GOPATH/bin tool paths are irrelevant inside the container. When
// needsDB is set the run shares studio_db's network namespace so DB-backed tests
// that dial localhost:5432 reach the database (as the pytest lane does); static
// analysis steps pass false.
func containerizeGo(step ToolStep, root Root, needsDB bool) ToolStep {
	step.Bin = filepath.Base(step.Bin)
	extra := goCacheMounts
	if needsDB {
		extra = append([]string{"--network", "container:studio_db"}, goCacheMounts...)
	}
	return containerizeIn(step, root, goTestImage, extra...)
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
	return containerizeGo(ToolStep{
		Name: "go-test",
		Bin:  "go",
		Args: []string{"test", "-race", "-coverprofile=coverage.out", "./..."},
		Dir:  filepath.Join(string(root), gearlistDir),
	}, root, true)
}

// GovulncheckStep returns a step that scans gearlist_backend for known Go
// vulnerabilities. Any non-zero exit code from govulncheck is treated as a
// failure, including exit code 3 (module-level findings).
func GovulncheckStep(root Root) ToolStep {
	return containerizeGo(goStep("govulncheck", goBinPath("govulncheck"), []string{"./..."}, root), root, false)
}

// GosecStep returns a step that runs gosec static security analysis against
// gearlist_backend, excluding test files.
func GosecStep(root Root) ToolStep {
	return containerizeGo(goStep("gosec", goBinPath("gosec"), []string{"-quiet", "./..."}, root), root, false)
}

// StaticcheckStep returns a step that runs staticcheck analysis against
// gearlist_backend.
func StaticcheckStep(root Root) ToolStep {
	return containerizeGo(goStep("staticcheck", goBinPath("staticcheck"), []string{"./..."}, root), root, false)
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
	return containerizeGo(ToolStep{
		Name: "go-test-scanner",
		Bin:  "go",
		Args: []string{"test", "-race", "-coverprofile=coverage.out", "./..."},
		Dir:  filepath.Join(string(root), pluginScannerDir),
	}, root, false)
}

// GoVetPluginScannerStep runs go vet against plugin_scanner.
func GoVetPluginScannerStep(root Root) ToolStep {
	return containerizeGo(goModuleStep("go-vet-scanner", "go", []string{"vet", "./..."}, filepath.Join(string(root), pluginScannerDir)), root, false)
}

// GovulncheckPluginScannerStep scans plugin_scanner for known Go vulnerabilities.
func GovulncheckPluginScannerStep(root Root) ToolStep {
	return containerizeGo(goModuleStep("govulncheck-scanner", goBinPath("govulncheck"), []string{"./..."}, filepath.Join(string(root), pluginScannerDir)), root, false)
}

// GosecPluginScannerStep runs gosec static analysis against plugin_scanner.
func GosecPluginScannerStep(root Root) ToolStep {
	return containerizeGo(goModuleStep("gosec-scanner", goBinPath("gosec"), []string{"-quiet", "./..."}, filepath.Join(string(root), pluginScannerDir)), root, false)
}

// StaticcheckPluginScannerStep runs staticcheck against plugin_scanner.
func StaticcheckPluginScannerStep(root Root) ToolStep {
	return containerizeGo(goModuleStep("staticcheck-scanner", goBinPath("staticcheck"), []string{"./..."}, filepath.Join(string(root), pluginScannerDir)), root, false)
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
