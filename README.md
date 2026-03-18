# STUD.io ControlRoom

A local web application for managing studio gear, plugins, instruments, and sample libraries — with a future Python-powered recommendation engine.

---

## What it is

ControlRoom is a full-stack CRUD app backed by PostgreSQL. It replaces the previous Google Sheets workflow for individual record edits, giving you a searchable, filterable UI for every table in the studio database.

The stack runs entirely in Docker. A single command starts everything.

---

## Documentation

| Document | Contents |
|---|---|
| [Setup & Operations](docs/setup.md) | Prerequisites, first-time setup, running the app, HTTPS, SonarQube |
| [Scripts Reference](docs/scripts.md) | Every script in `scripts/` and `util/`, with usage and purpose |
| [User Manual](docs/manual.md) | Features, navigation, and how to use the application |
| [Architecture](docs/arch/) | Stack, data model, API design, frontend structure |
| [Legacy CSV Pipeline](docs/legacy.md) | The original CSV import workflow and converter scripts |

---

## Quick start

```bash
# First time only
./scripts/install-hooks.sh

# Start the app (stack + unit tests + E2E tests)
./build.sh

# Start the app with SonarQube quality gate
./build.sh --dev
```

App runs at `https://localhost:2112`. Default login: `admin` / `admin`.

See [docs/setup.md](docs/setup.md) for prerequisites, HTTPS setup, and full details.

---

## Current version: v1.5

Full REST API, Next.js frontend, JWT auth with RBAC, Google Sign-In, database backup/restore with manifest-based verification, user management, brand typeahead with inline create, SonarQube quality gate, Playwright E2E test suite, and pre-commit hooks. See the [user manual](docs/manual.md) for the complete feature list and the [architecture docs](docs/arch/) for the technical overview.
