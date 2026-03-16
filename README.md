# STUD.io ControlRoom

A STUD.io application for managing studio gear, plugins, instruments, and sample libraries — with a future Python-powered recommendation engine.

---

## Section 1: Running the Application

### Prerequisites
- Docker + Docker Compose
- Python 3.12+ (conda/miniconda recommended — hooks auto-detect Anaconda and Miniconda installs)
- Node.js 18+ (nvm recommended — hooks auto-detect nvm installs)
- [mkcert](https://github.com/FiloSottile/mkcert) (for local HTTPS certificates)

### First-time git hooks setup

Install the Python tools the hooks depend on:

```bash
pip install pre-commit bandit pip-audit pytest pytest-cov
```

Then install the hooks:

```bash
./scripts/install-hooks.sh
```

This wires up the [pre-commit framework](https://pre-commit.com) to run seven checks before every commit:

| Hook | Script | What it checks |
|---|---|---|
| `ruff` | (built-in) | Python lint (backend only) |
| `pytest` | `scripts/run-pytest.sh` | Full backend test suite (209 tests) |
| `tsc` | `scripts/run-tsc.sh` | TypeScript type-check (frontend) |
| `jest` | `scripts/run-jest.sh` | Frontend unit tests |
| `bandit` | `scripts/run-bandit.sh` | Python security scan (SAST) |
| `pip-audit` | `scripts/run-pip-audit.sh` | Python dependency CVEs |
| `npm-audit` | `scripts/run-npm-audit.sh` | Node dependency CVEs |

The commit is aborted if any check fails. Hook configuration lives in `.pre-commit-config.yaml`.

**Security suppressions:**
- `bandit` skips B104 (intentional `0.0.0.0` Docker binding) and B608 (asyncpg queries use f-strings for hardcoded table names only; all values are parameterized). Config in `.bandit`.
- `pip-audit` ignores CVE-2024-23342 (Minerva timing attack on ECDSA keys in the `ecdsa` package — irrelevant because we use HS256/HMAC JWTs, not EC keys).
- `npm-audit` runs at `--audit-level=critical` only. Two high-severity Next.js 14.x CVEs (GHSA-9g9p-9gw9-jx7f, GHSA-h25m-26qc-wcjf) have no 14.x fix — they require a breaking upgrade to Next.js 16. Neither applies to this app (no `remotePatterns` configured, no insecure RSC).

---

### First-time HTTPS setup

The app runs over HTTPS via an nginx reverse proxy. On a new machine:

```bash
# Install mkcert CA so browsers trust the local cert
mkcert -install

# Generate the certificate (covers localhost + local network hostname)
mkcert -cert-file nginx/certs/cert.pem \
       -key-file  nginx/certs/key.pem \
       localhost 127.0.0.1 192.168.1.230 rogueone rogueone.local 192.168.1.230.sslip.io
```

> The `nginx/certs/` directory is git-ignored — certs must be generated locally on each machine.

### Start everything

```bash
./app.sh          # studio stack only
./app.sh --dev    # studio stack + SonarQube
```

This will:
1. Build and start all four containers (`studio_db`, `controlroom_backend`, `controlroom_frontend`, `controlroom_nginx`)
2. Wait for PostgreSQL, API, and frontend to be healthy
3. Apply schema and semantic views to both databases
4. Run the full backend test suite (209 tests)

| Service | URL |
|---|---|
| **App** (Next.js) | `https://localhost:2112` |
| **API** (FastAPI) | `https://localhost:5150` |
| **API Docs** (Swagger) | `https://localhost:5150/docs` |

> First run takes longer — Docker builds the frontend image and `npm install` runs inside the container.

### Accessing from other devices on the network

Update `NEXT_PUBLIC_API_URL` in `docker-compose.yml` to your machine's local IP (e.g. `https://192.168.1.230:5150`), then regenerate the mkcert certificate to include that IP and reinstall the root CA on the remote device.

---

### Dev Tooling Stack (SonarQube)

A separate Docker project (`dev`) runs SonarQube for static analysis. It is completely isolated from the studio stack.

```bash
./scripts/dev.sh up      # Start (safe to run every time)
./scripts/dev.sh down    # Stop (preserves data)
./scripts/dev.sh reset   # Wipe all data and start fresh
./scripts/dev.sh status  # Show running containers
```

Or start it together with the main stack:

```bash
./app.sh --dev
```

`up` is progressive — each setup step only runs if needed:
1. Password changed from default (once)
2. Project created (once)
3. Analysis token generated and saved to `.sonar-token` (once, gitignored)

SonarQube opens at `http://localhost:9000`. Login: `admin` / `My@mpGoesTo11`.

To run a scan after the dev stack is up:

```bash
./scripts/sonar-scan.sh
```

The scan script does three things before uploading to SonarQube:
1. Runs `pytest --cov` → generates `app/controlroom_backend/coverage.xml` (Cobertura format)
2. Runs `jest --coverage` → generates `app/controlroom_frontend/coverage/lcov.info`
3. Rewrites lcov `SF:` paths to be relative to the project root (Jest emits paths relative to the frontend directory; SonarQube resolves from the project root)

Results appear at `http://localhost:9000/dashboard?id=controlroom`.

**Quality gate** (must pass for scan to succeed):
- Zero new violations on new/changed code
- ≥ 80% line coverage on new/changed code

> The scanner prints `ANALYSIS SUCCESSFUL, you can find the results at: http://sonarqube:9000/...` — ignore that URL. It's the internal container hostname. Use the link above instead.

> Both stacks can run simultaneously — they use separate Docker networks and volumes.

---

### CSV Pipeline (legacy data refresh)

To re-run the CSV import pipeline and reseed the `studio` database:
```bash
./util/studio_csv.sh
```

---

### Databases

| Database | Purpose |
|---|---|
| `studio` | Legacy CSV pipeline target — source of truth for import data |
| `controlroomdb` | Application database — used by the API and UI |
| `controlroomdb_test` | Test database — used by the automated test suite |

All three databases live in the same PostgreSQL container (`studio_db`) on port `5432`.

---

## Section 2: Application Roadmap

### Current State (v1.3)
- PostgreSQL schema fully defined with lookup tables (no ENUMs)
- Semantic view layer (`sql/views.sql`) — 11 views resolving all UUID arrays to `[{id, name}]`, `parent_ids` cross-table, and `full_*_name` computed fields
- FastAPI backend — 209 tests passing, all endpoints live at `https://localhost:5150`
- Full REST API: Brands, Models, Effects, Instruments, Libraries, Workstations, Tools (5 tables), Config (7 lookup tables), Search, Admin (backup/restore), Users
- Next.js frontend — dark studio UI, sortable/filterable/resizable/reorderable data tables, read/edit/create/delete modals, all tables wired to the API
- Row virtualization on large tables (Effects, Instruments, Libraries, Models)
- Navigation: CATALOG, SESSION, TOOLS, CONFIG, ADMIN sections
- Database backup and restore via the Admin UI
- **Auth & RBAC**: JWT authentication with two roles — `admin` (full read/write) and `user` (read-only). Write access is enforced at the API layer; Add/Edit/Delete controls hidden in the UI for non-admins. The ADMIN sidebar section is hidden for non-admins.
- **Google Sign-In** (optional): set `GOOGLE_CLIENT_ID` in `docker-compose.yml` to enable a Google Sign-In button on the login page and a "Link Google" option in the Users admin panel. Leave empty to disable.
- User management UI — add users, change passwords, toggle roles, link Google accounts
- Default credentials: `admin` / `admin` (seeded automatically on first startup, role `admin`)
- **HTTPS**: nginx reverse proxy with mkcert certificates — all traffic encrypted. Accessible on local network via `192.168.1.230.sslip.io` (public TLD resolving to the local IP, accepted by Google OAuth)
- **Code quality**: SonarQube static analysis with quality gate enforcement. Pre-commit hooks run ruff, pytest, tsc, jest, bandit, pip-audit, and npm-audit before every commit.
- **Code coverage**: pytest-cov (backend) and Jest/lcov (frontend) wired into the SonarQube scan. New code must have ≥ 80% coverage to pass the quality gate.
- Full stack runs in Docker via `./app.sh`

### Future
- Python recommendation engine (shared FastAPI codebase)
- Google Sheets export
- Migrate nginx reverse proxy to Caddy (simpler config, built-in HTTPS/local CA)

---

## Section 3: Legacy CSV Workflow

The original data pipeline imports studio gear data from Google Sheets exports into PostgreSQL via a series of Python converter scripts.

### Flow

```
Google Sheets exports (import/*.csv)
        ↓
  Converter scripts (util/)
        ↓
  Normalized CSVs (csv/)
        ↓
  Seed generator (generate_seeds.py)
        ↓
  SQL seed files (sql/seeds/)
        ↓
  reseed.py → studio database
```

### Scripts

| Script | Purpose |
|---|---|
| `util/convert_effects.py` | Maps Effects sheet → `csv/effects.csv` |
| `util/convert_instruments.py` | Maps Instruments sheet → `csv/instruments.csv` |
| `util/convert_libraries.py` | Maps Libraries sheet → `csv/libraries.csv` |
| `util/convert_models.py` | Maps Models sheet → `csv/models.csv` |
| `util/generate_seeds.py` | Reads all CSVs, generates SQL INSERT files in `sql/seeds/` |
| `util/reseed.py` | Drops and recreates the `studio` database, applies schema + seeds |
| `util/studio_csv.sh` | Runs the full pipeline end-to-end |

### Notes
- Converters preserve existing UUIDs on re-runs — records are stable across imports
- All ENUM values (tag types, effect types, etc.) are resolved to lookup table UUIDs at seed generation time
- The `studio` database is the CSV pipeline target and is kept separate from `controlroomdb`, which is managed exclusively through the application going forward
