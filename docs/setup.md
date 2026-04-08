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
pip install pre-commit bandit pip-audit pytest pytest-cov detect-secrets
```

### 2. Install git hooks

```bash
pre-commit install
```

This wires up the [pre-commit framework](https://pre-commit.com) to run eight checks before every commit:

| Hook | What it checks |
|---|---|
| `ruff` | Python lint (backend only) |
| `pytest` | Full backend test suite |
| `tsc` | TypeScript type-check (frontend) |
| `jest` | Frontend unit tests |
| `bandit` | Python security scan (SAST) |
| `pip-audit` | Python dependency CVEs |
| `npm-audit` | Node dependency CVEs |
| `detect-secrets` | Secrets and credentials in staged files |

The commit is aborted if any check fails. Hook configuration lives in `.pre-commit-config.yaml`.

**Security suppressions:**
- `bandit` skips B104 (intentional `0.0.0.0` Docker binding) and B608 (asyncpg queries use f-strings for hardcoded table names only — all values are parameterized). Config in `.bandit`.
- `pip-audit` ignores CVE-2024-23342 (Minerva timing attack on ECDSA keys in the `ecdsa` package — irrelevant because HS256/HMAC JWTs are used, not EC keys).
- `npm-audit` runs at `--audit-level=critical` only. GHSA-9g9p-9gw9-jx7f and GHSA-h25m-26qc-wcjf (Next.js 14.x) are resolved — the app is on Next.js 16.
- `detect-secrets` uses `.secrets.baseline` to suppress known findings (test fixture passwords, local dev DB credentials). `package-lock.json`, `.secrets.baseline` itself, and `structurizr/workspace.json` (generated file with Base64 layout data) are excluded from scanning. If you add a new legitimate non-secret that triggers a false positive, update the baseline (see `docs/arch/security.md` — Baseline management).

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

To manage the stack without running tests:
```bash
roadie start        # start production stack
roadie start --dev  # start production stack + dev tools (SonarQube, Structurizr)
roadie stop         # stop production stack
roadie stop --dev   # stop production stack + dev tools
roadie restart      # stop then start
roadie status       # show running containers
```

To build and run the full test suite:
```bash
roadie build              # rebuild images, apply schema to test DBs, run unit tests
roadie build --e2e        # also run Playwright E2E shards
roadie build --dev        # include dev overlay (SonarQube + Structurizr)
roadie build --skip-tests # rebuild images and apply schema only
roadie release            # full release gate: rebuild dev stack + unit + E2E + scan + perf
```

This builds and starts four containers (`studio_db`, `controlroom_backend`, `controlroom_frontend`, `controlroom_nginx`), waits for each to be healthy, applies the schema and semantic views to both databases, and runs the test suite.

| Service | URL |
|---|---|
| **App** (Next.js) | `https://localhost:2112` |
| **API** (FastAPI) | `https://localhost:5150` |
| **API Docs** (Swagger) | `https://localhost:5150/docs` |

First run takes longer — Docker builds the frontend image and `npm ci` runs inside the container.

### Accessing from other devices on the network

The app uses a BFF (Backend for Frontend) architecture — all API calls are relative paths routed through the Next.js server. There is no `NEXT_PUBLIC_API_URL` to change.

To access from another machine:
1. Make sure the mkcert certificate includes that machine's IP (see step 3 above — `192.168.1.230` is already included)
2. Install the mkcert root CA on the remote device
3. Browse to `https://192.168.1.230:2112` from the remote machine

### Google SSO and sslip.io

Google OAuth does not permit raw IP addresses in Authorized JavaScript Origins. To use Google Sign-In from any machine (including localhost or remote LAN devices), you must use a DNS-resolvable hostname.

**[sslip.io](https://sslip.io)** is a public DNS service that maps `<ip>.sslip.io` to that IP. For example, `192.168.1.230.sslip.io` resolves to `192.168.1.230`.

**Google Cloud Console configuration (already done):**
- Authorized JavaScript origins: `https://192.168.1.230.sslip.io:2112`
- Authorized redirect URIs: `https://192.168.1.230.sslip.io:2112`

**mkcert certificate** (already included in the generation command above): `192.168.1.230.sslip.io`

**To log in with Google from any machine**, navigate to:
```
https://192.168.1.230.sslip.io:2112
```

Standard username/password login works on any URL (localhost, IP, or sslip.io hostname). Google SSO requires the sslip.io hostname specifically.

---

## Dev tooling stack (SonarQube + Structurizr)

A separate Docker project (`dev`) runs SonarQube and Structurizr, completely isolated from the studio stack.

```bash
roadie start --dev    # Start (safe to run every time — idempotent)
roadie stop --dev     # Stop (preserves data)
roadie status         # Show running containers
```

Or rebuild everything alongside the main stack:

```bash
roadie build --dev
```

`up` is idempotent — each setup step only runs if needed:
1. Password changed from default (once)
2. Project created (once)
3. Analysis token generated and saved to `.sonar-token` (once, gitignored)

| Service | URL | Notes |
|---|---|---|
| SonarQube | `http://localhost:1969` | Login: `admin` / `My@mpGoesTo11` |
| Structurizr | `http://localhost:1967` | No login required |

### Running a scan

```bash
roadie test scan sonar
```

Or to run the full security suite (Sonar + Trivy + secrets + headers):

```bash
roadie test scan
```

The scan:
1. Runs `pytest --cov` → generates `app/controlroom_backend/coverage.xml` (Cobertura format)
2. Runs `jest --coverage` → generates `app/controlroom_frontend/coverage/lcov.info`
3. Rewrites lcov `SF:` paths to be relative to the project root (Jest emits paths relative to the frontend directory; SonarQube resolves from the project root)
4. Uploads everything to SonarQube

Results: `http://localhost:1969/dashboard?id=controlroom`

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
