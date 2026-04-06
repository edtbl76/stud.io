# Roadie CLI

Roadie is a Go binary that manages the STUD.io stack, builds, tests, scans, and releases. It replaces `roadie.sh`, `build.sh`, and all `scripts/run-*.sh` / `test-*.sh` wrappers with a single, provider-abstracted entry point.

Source lives in `roadie/` at the repo root.

---

## Building

From the repo root:

```bash
cd roadie
go build -o ../roadie ./cmd/roadie/
cd ..
```

This produces a `roadie` binary at the repo root. To make it available system-wide:

```bash
sudo cp roadie /usr/local/bin/roadie
```

Or add the repo root to your `PATH` in `~/.bashrc` / `~/.zshrc`:

```bash
export PATH="$HOME/Documents/Studio/STUD.io:$PATH"
```

To embed the version at build time:

```bash
go build -ldflags "-X main.version=1.0.0" -o ../roadie ./cmd/roadie/
```

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

#### Other

| Command | Description |
|---|---|
| `roadie version` | Print the roadie version |
| `roadie help` | Show help for any command |
| `roadie completion` | Generate shell autocompletion script |

### Shell autocompletion

```bash
# bash
roadie completion bash > /etc/bash_completion.d/roadie

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
    compose_file: docker-compose.yml       # required
    dev_compose_file: docker-compose.dev.yml
  database:
    service: studio_db                     # required
    user: studio                           # required

stack:
  health_checks:
    - name: PostgreSQL
      type: database
      user: studio
    - name: API
      type: http
      url: https://localhost:5150/health
  dev_health_checks:
    - name: SonarQube
      type: http
      url: http://localhost:1969
  urls:
    app: https://localhost:2112
    api: https://localhost:5150
```

Health check types:

| Type | Required fields | How it works |
|---|---|---|
| `database` | `user` | `docker compose exec database pg_isready -U <user> -q` |
| `http` | `url` | HTTP GET, passes on any 2xx |

Roadie polls each health check every 2 seconds with a 5-minute timeout. If the context is cancelled (e.g. Ctrl-C) it exits immediately.

---

## Pipeline engine (`internal/pipeline`)

The pipeline package is the execution layer for all tool invocations. It replaces the `scripts/run-*.sh` wrappers by providing type-safe, testable equivalents in Go.

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

`RunCollect` returns `[]StepResult` (name, error, duration). Call `PrintSummary(out, results)` to write the PASS/FAIL table. Phase 6 will add a JSON path via the same results slice.

### PATH resolution

Tools that require Node or Python are located at step-creation time:

| Function | Search order |
|---|---|
| `ResolveNode()` | `~/.nvm/versions/node/<latest>/bin` → `/usr/local/bin` → `/usr/bin` |
| `ResolvePython()` | `~/anaconda3/bin` → `~/miniconda3/bin` → `~/opt/anaconda3/bin` → `~/opt/miniconda3/bin` |

The resolved directory is injected as `PATH=<dir>:$PATH` in the step's `Env` field. If no managed runtime is found the step inherits the shell's PATH.

### Factory functions

| Function | Replaces | Notes |
|---|---|---|
| `TscStep(root)` | `run-tsc.sh` | Uses `node_modules/.bin/tsc --noEmit` |
| `JestStep(root, coverage)` | `run-jest.sh` | Pass `coverage=true` for SonarQube lcov report |
| `PytestStep(root, extraArgs...)` | `run-pytest.sh` | Extra args appended after the test dir |
| `BanditStep(root)` | `run-bandit.sh` | |
| `PipAuditStep(root)` | `run-pip-audit.sh` | Ignores CVE-2024-23342 (see script for rationale) |
| `NpmAuditStep(root)` | `run-npm-audit.sh` | `--audit-level=critical` |
| `TrivyStep(root, imageRef)` | `run-trivy.sh` scan() | Single image; caller resolves `imageRef` via `docker inspect` |

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
      runner.go              — cmdRunner interface + realRunner (shell execution abstraction)
      docker.go              — DockerProvider: ContainerProvider via docker compose
      postgres.go            — PostgresProvider: SQLDatabaseProvider via docker compose exec
      http_checker.go        — HTTPChecker: HTTPHealthChecker via net/http
    stack/
      manager.go             — StackManager: orchestrates start/stop/health checks
    pipeline/
      pipeline.go            — LabelWriter, ToolStep, Pipeline, StepResult, PrintSummary
      resolve.go             — ResolveNode / ResolvePython (NVM + conda PATH discovery)
      steps.go               — ToolStep factory functions (TscStep, JestStep, PytestStep, …)
    commands/
      stack.go               — start, stop, restart, status Cobra subcommands
```

---

## Implementation phases

| Phase | Commands added | Retires |
|---|---|---|
| 1 ✓ | `version` | — |
| 2 ✓ | `start`, `stop`, `restart`, `status` | `roadie.sh` |
| 3 ✓ | Pipeline engine (ToolStep, streaming output) | `scripts/run-*.sh` safety wrappers |
| 4 | `build`, `release` | `build.sh` |
| 5 | `test`, `scan`, `perf` (full flag surface) | `test-*.sh`, remaining `scripts/run-*.sh` |
| 6 | `doctor`, `--json` flag, summary output | — |

---

## Running tests

From the `roadie/` directory:

```bash
go test ./...
```
