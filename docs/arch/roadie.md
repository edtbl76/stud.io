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
| `database` | `user` | `docker compose exec pg_isready -U <user> -q` |
| `http` | `url` | HTTP GET, passes on any 2xx |

Roadie polls each health check every 2 seconds with a 5-minute timeout. If the context is cancelled (e.g. Ctrl-C) it exits immediately.

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
    commands/
      stack.go               — start, stop, restart, status Cobra subcommands
```

---

## Implementation phases

| Phase | Commands added | Retires |
|---|---|---|
| 1 ✓ | `version` | — |
| 2 ✓ | `start`, `stop`, `restart`, `status` | `roadie.sh` |
| 3 | Pipeline engine (ToolStep, streaming output) | `scripts/run-*.sh` safety wrappers |
| 4 | `build`, `release` | `build.sh` |
| 5 | `test`, `scan`, `perf` (full flag surface) | `test-*.sh`, remaining `scripts/run-*.sh` |
| 6 | `doctor`, `--json` flag, summary output | — |

---

## Running tests

From the `roadie/` directory:

```bash
go test ./...
```
