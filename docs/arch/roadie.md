# Roadie CLI

Roadie is a Go binary that manages the STUD.io stack, builds, tests, scans, and releases. It replaces `roadie.sh`, `build.sh`, and all `scripts/run-*.sh` / `test-*.sh` wrappers with a single, provider-abstracted entry point.

Source lives in `roadie/` at the repo root.

---

## Building

Build and install globally (required before `pre-commit install`):

```bash
./build_roadie.sh
```

This compiles the Go binary and installs it to `/usr/local/bin/roadie`. Pre-commit hooks invoke `roadie` by name and require it on PATH.

To embed the version at build time:

```bash
go build -ldflags "-X main.version=1.0.0" -o ../roadie ./cmd/roadie/
```

---

## Pre-commit hooks

After `pre-commit install`, the pre-commit framework runs automatically when you `git commit`. To run hooks manually without making a commit — for example to diagnose a failure or check your working tree before committing:

```bash
# Run all hooks against staged files only (mirrors what git commit triggers)
pre-commit run

# Run all hooks against every file in the repo
pre-commit run --all-files

# Run a single hook by its ID (faster when debugging one specific check)
pre-commit run ruff
pre-commit run bandit
pre-commit run detect-secrets
pre-commit run jest
pre-commit run pytest
```

Hook IDs are defined in `.pre-commit-config.yaml` at the repo root. `pre-commit run --all-files` is the most thorough check and is the right command to reach for before pushing.

Note: PBT tests (`roadie test pbt`) and E2E tests (`roadie test e2e`) are excluded from the pre-commit hook intentionally — they are too slow to run on every commit. Run them manually or via `roadie test full`.

---

## Running

```text
roadie [command] [flags]
```

### Global flags

| Flag | Description |
|---|---|
| `--verbose` / `-v` | Enable verbose output |
| `--help` / `-h` | Show help |

### Commands

#### Stack management

| Command | Description | Replaces |
|---|---|---|
| `roadie start [--dev]` | Start the stack and wait for all health checks | `roadie.sh start` |
| `roadie stop [--dev]` | Stop the stack | `roadie.sh stop` |
| `roadie restart [--dev]` | Stop then start | `roadie.sh restart` |
| `roadie status` | Show running services | `roadie.sh status` |

The `--dev` flag includes the SonarQube and Structurizr dev overlay (`docker-compose.dev.yml`).

#### Build commands

| Command | Description | Replaces |
|---|---|---|
| `roadie build [--dev] [--skip-tests] [--e2e] [--scan] [--perf] [--full]` | Rebuild images, apply schema to test DBs, run tests | `build.sh` |
| `roadie release` | Full release gate: rebuild dev stack and run all suites | `build.sh --release` |

#### Test commands

| Command | Description | Replaces |
|---|---|---|
| `roadie test unit [tsc\|jest\|ruff\|bandit\|pytest\|pip-audit\|npm-audit]` | Run unit suite; positional args filter tools | `test-unit.sh`, `run-tsc.sh`, `run-jest.sh`, `run-pytest.sh` |
| `roadie test e2e` | Run full sharded Playwright suite | `test-e2e.sh` (delegates internally) |
| `roadie test scan [sonar\|trivy\|secrets\|headers] [--gate]` | Run security checks in collect mode | `test-scan.sh` |
| `roadie test perf [bundle\|benchmarks\|k6\|lighthouse] [--no-bundle]` | Run performance suite in collect mode | `test-perf.sh` (delegates internally) |
| `roadie test pbt [fast-check\|hypothesis] [--json]` | Run property-based tests in collect mode | — |
| `roadie test full` | Run unit + pbt (parallel), then scan (--gate) → e2e → perf | — |

`--gate` adds a SonarQube quality gate poll after the sonar scan. `--no-bundle` skips the Next.js production build (reuse existing `.next-perf`).

**Property-based tests (`roadie test pbt`):** Runs fast-check (frontend, Jest) and hypothesis (backend, pytest) in collect mode — both engines run regardless of individual failure, and a summary table is printed. Configure the number of examples per property in `roadie.yml`:

```yaml
test:
  pbt:
    examples: 100  # default; increase for pre-release thoroughness
```

Frontend PBT tests live in `app/controlroom_frontend/__tests__/pbt/`. Backend PBT tests live in `app/controlroom_backend/tests/pbt/`. These are excluded from the pre-commit hook — run `roadie test pbt` manually or rely on `roadie test full`.

`--full` is shorthand for `--e2e --scan --perf`. `--dev` includes the SonarQube/Structurizr overlay. `--skip-tests` skips the unit suite but does not suppress `--e2e`, `--scan`, or `--perf`.

`roadie release` is equivalent to `roadie build --dev --full` — no flags can be omitted.

**Schema application:** Before running tests, `roadie build` applies each file in `build.schema_files` to every database in `build.databases`. The production database never appears in `build.databases` — use `roadie db init` for first-time production setup.

#### Database commands

| Command | Description |
|---|---|
| `roadie db init [--yes]` | Apply schema files to the production database (first-time setup only) |

`roadie db init` includes an interactive confirmation gate. The user must type exactly `"yes"` to proceed. Use `--yes` to bypass the gate for scripted or CI use.

This command targets the database named in `providers.database.db_name`. It will fail if the tables already exist. It is intended for first-time setup — use `roadie build` for ongoing schema application to test databases.

#### Other

| Command | Description |
|---|---|
| `roadie doctor` | Check prerequisites (Docker, Node, Python, Go, tools) and print a pass/fail summary |
| `roadie version` | Print the roadie version |
| `roadie help` | Show help for any command |
| `roadie completion` | Generate shell autocompletion script |

### Shell autocompletion

```bash
# bash — system-wide (use tee, not >, for the sudo redirect):
roadie completion bash | sudo tee /etc/bash_completion.d/roadie

# bash — current user only (no sudo needed):
mkdir -p ~/.local/share/bash-completion/completions
roadie completion bash > ~/.local/share/bash-completion/completions/roadie
source ~/.bashrc

# zsh
roadie completion zsh > "${fpath[1]}/_roadie"
```

---

## Configuration

Roadie reads `roadie.yml` from the current working directory (always the repo root). The file is already present at `STUD.io/roadie.yml`.

Required fields:

```yaml
providers:
  container:
    type: docker
    compose_file: docker-compose.yml         # required
    dev_compose_file: docker-compose.dev.yml
  database:
    service: studio_db                       # required
    user: studio                             # required
    db_name: controlroomdb                   # required for roadie db init

stack:
  health_checks:
    - name: PostgreSQL
      type: database
      user: studio
    - name: API
      type: http
      url: https://localhost:5150/health
    - name: Frontend
      type: http
      url: https://localhost:2112
  dev_health_checks:
    - name: SonarQube
      type: http
      url: http://localhost:1969
    - name: Structurizr
      type: http
      url: http://localhost:1967
  urls:
    app: https://localhost:2112
    api: https://localhost:5150
    docs: https://localhost:5150/docs
    sonarqube: http://localhost:1969
    structurizr: http://localhost:1967

build:
  schema_files:                              # applied in order to each database in `databases`
    - sql/schema.sql
    - sql/views.sql
  databases:                                 # test databases only — never production
    - controlroomdb_test
```

Health check types:

| Type | Required fields | How it works |
|---|---|---|
| `database` | `user` | `docker compose exec database pg_isready -U <user> -q` |
| `http` | `url` | HTTP GET, passes on any 2xx |

Roadie polls each health check every 2 seconds with a 5-minute timeout. If the context is cancelled (e.g. Ctrl-C) it exits immediately.

---

## Pipeline engine (`internal/pipeline`)

The pipeline package is the execution layer for all tool invocations. It provides type-safe, testable equivalents in Go for every tool previously wrapped by shell scripts.

### Layers

```text
Pipeline
  └─ []ToolStep
        └─ stepRunner (interface)
              └─ realStepRunner   (production: exec.CommandContext with Dir + Env)
              └─ fakeStepRunner   (tests: records calls, injects errors)
```

Each `ToolStep` routes its output through a `LabelWriter` before writing to the caller's `io.Writer`, so every output line is prefixed with `[stepname]` — the same pattern as `sed -u 's/^/[label] /'` in the shell scripts.

### Execution modes

| Mode | Method | Behaviour | Used by |
|---|---|---|---|
| Fatal-sequential | `Pipeline.RunSequential` | Stop and return on first failure | `roadie test unit` |
| Collect | `Pipeline.RunCollect` | Run all steps, accumulate results, return combined error | `roadie test scan`, `roadie test perf` |

`RunCollect` returns `[]StepResult` (name, error, duration). Call `PrintSummary(out, results)` to write the PASS/FAIL table, or `PrintSummaryJSON(out, results)` for machine-readable output. Commands that use `RunCollect` (`scan`, `perf`) expose a `--json` flag that switches between the two.

### PATH resolution

Tools that require Node or Python are located at step-creation time:

| Function | Search order |
|---|---|
| `ResolveNode()` | `~/.nvm/versions/node/<latest>/bin` → `/usr/local/bin` → `/usr/bin` |
| `ResolvePython()` | `~/anaconda3/bin` → `~/miniconda3/bin` → `~/opt/anaconda3/bin` → `~/opt/miniconda3/bin` |

The resolved directory is injected as `PATH=<dir>:$PATH` in the step's `Env` field. If no managed runtime is found the step inherits the shell's PATH.

### Types

The pipeline package exports two named string types to prevent raw-string confusion at call sites:

| Type | Used for |
|---|---|
| `Root` | Filesystem root of the monorepo — passed to all step factory functions |
| `ImageRef` | Docker image SHA or tag — passed to `TrivyStep` |

Go untyped string constants (e.g. `"."`, `"/repo"`) are assignable to these types without a cast. Typed `string` variables require an explicit conversion: `pipeline.Root(myStringVar)`.

### Factory functions

| Function | Replaces | Notes |
|---|---|---|
| `NpmInstallStep(root Root)` | — | Runs `npm install --include=dev` in the frontend directory |
| `TscStep(root Root)` | `run-tsc.sh` | Uses `node_modules/.bin/tsc --noEmit` |
| `JestStep(root Root, coverage bool)` | `run-jest.sh` | Pass `coverage=true` for SonarQube lcov report |
| `PytestStep(root Root, extraArgs ...string)` | `run-pytest.sh` | Extra args appended after the test dir |
| `BanditStep(root Root)` | `run-bandit.sh` | |
| `PipAuditStep(root Root)` | `run-pip-audit.sh` | Ignores CVE-2024-23342 (see script for rationale) |
| `NpmAuditStep(root Root)` | `run-npm-audit.sh` | `--audit-level=critical` |
| `TrivyStep(root Root, image ImageRef)` | `run-trivy.sh` scan() | Single image; caller resolves `image` via `docker inspect` |
| `TrivyBackendStep(root Root)` | — | Resolves `controlroom_backend` image SHA at runtime, then scans |
| `TrivyFrontendStep(root Root)` | — | Resolves `controlroom_frontend` image SHA at runtime, then scans |
| `SonarScanStep(root Root, gate bool)` | `test-scan.sh --sonar[‑gate]` | `gate=true` adds quality gate poll |
| `DetectSecretsStep(root Root)` | `test-scan.sh --secrets` | Scans working tree; compares against `.secrets.baseline` |
| `SecurityHeadersStep(root Root)` | `test-scan.sh --headers` | Runs `pytest tests/security/test_security_headers.py` |

### Test injection

`ToolStep` and `Pipeline` both expose an unexported `withRunner(r stepRunner)` copy-constructor. Tests in the `pipeline` package use a `fakeStepRunner` to record calls and inject per-binary errors without spawning real processes.

---

## Project layout

```
roadie/
  cmd/roadie/
    main.go                  — Cobra root, --version, --verbose flag
  internal/
    config/
      config.go              — Loads and validates roadie.yml
      types.go               — Config struct types
    providers/
      container.go           — ContainerProvider interface
      database.go            — SQLDatabaseProvider interface
      http.go                — HTTPHealthChecker interface
      base.go                — baseProvider (retry logic, embedded by concrete providers)
      runner.go              — cmdRunner interface + realRunner + IOStreams
      docker.go              — DockerProvider: ContainerProvider via docker compose
      postgres.go            — PostgresProvider: SQLDatabaseProvider via docker compose exec
      http_checker.go        — HTTPChecker: HTTPHealthChecker via net/http
    stack/
      manager.go             — StackManager: orchestrates start/stop/health checks
    pipeline/
      pipeline.go            — LabelWriter, ToolStep, Pipeline, StepResult, PrintSummary
      resolve.go             — ResolveNode / ResolvePython (NVM + conda PATH discovery)
      steps.go               — Root + ImageRef types; ToolStep factory functions
    commands/
      stack.go               — start, stop, restart, status Cobra subcommands
      build.go               — build, release Cobra subcommands; schemaApplier; buildUnitPipeline
      db.go                  — db init Cobra subcommand with confirmation gate
      test.go                — test unit/e2e/scan/perf/pbt/full Cobra subcommands
      doctor.go              — doctor Cobra subcommand; prerequisite checks
```

---

## Implementation phases

| Phase | Commands added | Retires |
|---|---|---|
| 1 ✓ | `version` | — |
| 2 ✓ | `start`, `stop`, `restart`, `status` | `roadie.sh` |
| 3 ✓ | Pipeline engine (ToolStep, streaming output) | `scripts/run-*.sh` wrappers |
| 4 ✓ | `build`, `release`, `db init` | `build.sh` |
| 5 ✓ | `test unit/e2e/scan/perf/full` | `test-unit.sh`, `test-scan.sh`, `run-tsc.sh`, `run-jest.sh`, `run-pytest.sh` |
| 6 ✓ | `doctor`, `--json` flag, summary output | — |
| 7 ✓ | `test unit pip-audit/npm-audit` | `scripts/` directory fully deleted |
| 8 ✓ | `test pbt [fast-check\|hypothesis]`, `test full` parallelism | — |

---

## Running tests

From the `roadie/` directory:

```bash
go test ./...
```
