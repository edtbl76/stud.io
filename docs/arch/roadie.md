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

```
roadie [command] [flags]
```

### Global flags

| Flag | Description |
|---|---|
| `--verbose` / `-v` | Enable verbose output |
| `--help` / `-h` | Show help |

### Commands (Phase 1)

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
  database:
    service: studio_db                     # required
    user: studio                           # required
```

Roadie will refuse to start if any required field is missing.

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
```

---

## Implementation phases

| Phase | Commands added | Retires |
|---|---|---|
| 1 (done) | `version` | — |
| 2 | `start`, `stop`, `restart`, `status` | `roadie.sh` |
| 3 | Pipeline engine | `scripts/run-*.sh` safety wrappers |
| 4 | `build`, `release` | `build.sh` |
| 5 | `test`, `scan`, `perf` (full flag surface) | `test-*.sh`, remaining `scripts/run-*.sh` |
| 6 | `doctor`, `--json` flag, summary output | — |

---

## Running tests

From the `roadie/` directory:

```bash
go test ./...
```
