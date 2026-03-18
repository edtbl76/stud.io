# Setup & Operations

## Prerequisites

- **Docker + Docker Compose** — runs all services
- **Python 3.12+** — conda/miniconda recommended; hooks auto-detect Anaconda and Miniconda installs
- **Node.js 18+** — nvm recommended; hooks auto-detect nvm installs
- **[mkcert](https://github.com/FiloSottile/mkcert)** — generates locally-trusted HTTPS certificates

---

## First-time setup

### 1. Install Python hook dependencies

```bash
pip install pre-commit bandit pip-audit pytest pytest-cov
```

### 2. Install git hooks

```bash
./scripts/install-hooks.sh
```

This wires up the [pre-commit framework](https://pre-commit.com) to run seven checks before every commit:

| Hook | What it checks |
|---|---|
| `ruff` | Python lint (backend only) |
| `pytest` | Full backend test suite |
| `tsc` | TypeScript type-check (frontend) |
| `jest` | Frontend unit tests |
| `bandit` | Python security scan (SAST) |
| `pip-audit` | Python dependency CVEs |
| `npm-audit` | Node dependency CVEs |

The commit is aborted if any check fails. Hook configuration lives in `.pre-commit-config.yaml`.

**Security suppressions:**
- `bandit` skips B104 (intentional `0.0.0.0` Docker binding) and B608 (asyncpg queries use f-strings for hardcoded table names only — all values are parameterized). Config in `.bandit`.
- `pip-audit` ignores CVE-2024-23342 (Minerva timing attack on ECDSA keys in the `ecdsa` package — irrelevant because HS256/HMAC JWTs are used, not EC keys).
- `npm-audit` runs at `--audit-level=critical` only. Two high-severity Next.js 14.x CVEs (GHSA-9g9p-9gw9-jx7f, GHSA-h25m-26qc-wcjf) have no 14.x fix — they require a breaking upgrade to Next.js 16. Neither applies to this app (no `remotePatterns` configured, no insecure RSC).

### 3. Generate HTTPS certificates

The app runs over HTTPS via an nginx reverse proxy. On each new machine:

```bash
# Install mkcert CA so browsers trust the local cert
mkcert -install

# Generate the certificate (adjust IPs/hostnames for your machine)
mkcert -cert-file nginx/certs/cert.pem \
       -key-file  nginx/certs/key.pem \
       localhost 127.0.0.1 192.168.1.230 rogueone rogueone.local 192.168.1.230.sslip.io
```

The `nginx/certs/` directory is git-ignored — certs must be generated locally on each machine.

---

## Running the app

```bash
./build.sh              # stack + unit tests + E2E tests
./build.sh --skip-tests # stack only
./build.sh --skip-e2e   # stack + unit tests only
./build.sh --dev        # stack + unit tests + SonarQube quality gate + E2E tests
```

This builds and starts four containers (`studio_db`, `controlroom_backend`, `controlroom_frontend`, `controlroom_nginx`), waits for each to be healthy, applies the schema and semantic views to both databases, and runs the test suite.

| Service | URL |
|---|---|
| **App** (Next.js) | `https://localhost:2112` |
| **API** (FastAPI) | `https://localhost:5150` |
| **API Docs** (Swagger) | `https://localhost:5150/docs` |

First run takes longer — Docker builds the frontend image and `npm install` runs inside the container.

### Accessing from other devices on the network

Update `NEXT_PUBLIC_API_URL` in `docker-compose.yml` to your machine's local IP (e.g. `https://192.168.1.230:5150`), then regenerate the mkcert certificate to include that IP and reinstall the root CA on the remote device.

---

## SonarQube (dev tooling)

A separate Docker project (`dev`) runs SonarQube for static analysis, completely isolated from the studio stack.

```bash
./scripts/dev.sh up      # Start (safe to run every time — idempotent)
./scripts/dev.sh down    # Stop (preserves data)
./scripts/dev.sh reset   # Wipe all data and start fresh
./scripts/dev.sh status  # Show running containers
```

Or start it alongside the main stack:

```bash
./build.sh --dev
```

`up` is idempotent — each setup step only runs if needed:
1. Password changed from default (once)
2. Project created (once)
3. Analysis token generated and saved to `.sonar-token` (once, gitignored)

SonarQube is at `http://localhost:9000`. Login: `admin` / `My@mpGoesTo11`.

### Running a scan

```bash
./scripts/sonar-scan.sh
```

The scan script:
1. Runs `pytest --cov` → generates `app/controlroom_backend/coverage.xml` (Cobertura format)
2. Runs `jest --coverage` → generates `app/controlroom_frontend/coverage/lcov.info`
3. Rewrites lcov `SF:` paths to be relative to the project root (Jest emits paths relative to the frontend directory; SonarQube resolves from the project root)
4. Uploads everything to SonarQube

Results: `http://localhost:9000/dashboard?id=controlroom`

> The scanner also prints a URL with `sonarqube` as the hostname — that's the internal container name. Use the link above instead.

**Quality gate thresholds:**
- Zero new violations on new/changed code
- ≥ 80% line coverage on new/changed code
- < 3% duplicated lines on new/changed code

---

## Databases

| Database | Purpose |
|---|---|
| `studio` | Legacy CSV pipeline target — source of truth for import data |
| `controlroomdb` | Application database — used by the API and UI |
| `controlroomdb_test` | Test database — used by the automated test suite |

All three live in the same PostgreSQL container (`studio_db`) on port `5432`.

### Re-running the CSV pipeline

To reseed the `studio` database from the latest CSV exports:

```bash
./util/studio_csv.sh
```

See [legacy.md](legacy.md) for the full pipeline details.
