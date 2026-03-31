# Scripts Reference

All scripts live in `scripts/` (dev tooling and hook runners) or `util/` (legacy CSV pipeline).

---

## scripts/

### `build.sh` *(project root)*

Main entry point. Starts the full Docker stack, runs tests, and optionally runs a SonarQube quality gate or full release gate.

```bash
./build.sh              # stack + unit tests + E2E tests
./build.sh --skip-tests # stack only
./build.sh --skip-e2e   # stack + unit tests only
./build.sh --dev        # stack + unit tests + SonarQube quality gate + E2E tests
./build.sh --release    # full release gate: --dev + Trivy + secrets + headers + perf
```

Flags can be combined (e.g. `./build.sh --dev --skip-e2e`). With `--dev` or `--release`, E2E is blocked if the SonarQube quality gate fails.

On startup it:
1. Builds and starts all containers
2. Waits for PostgreSQL, API, and frontend health checks
3. Applies `sql/schema.sql` and `sql/views.sql` to `controlroomdb` and `controlroomdb_test`
4. Runs backend (`pytest`) and frontend (`jest`) unit tests
5. (With `--dev`) Runs the SonarQube scanner and checks the quality gate — aborts if it fails
6. (With `--release`) Runs the full security scan (`test-scan.sh`) — aborts if any check fails
7. Runs the Playwright E2E test suite
8. (With `--release`) Runs the performance suite (`test-perf.sh`)

---

### `scripts/test-perf.sh`

Runs the full performance test suite. Not part of the standard build — run on demand when you want to measure performance or validate SLOs.

```bash
./scripts/test-perf.sh
```

Prerequisites: production stack running (`docker compose up -d`), dev stack running (`./scripts/dev.sh up`), `controlroomdb_test` provisioned (`./scripts/reset-test-db.sh`).

Steps performed:
1. Starts a single backend container pointing at `controlroomdb_test` (read-only — no clone)
2. Runs `next build` (production build) with `ANALYZE=true` — bundle reports written to `.next-perf/analyze/`
3. Starts `next start` (production server)
4. `pytest tests/test_query_plans.py tests/test_benchmarks.py` — EXPLAIN plan assertions and 14 function benchmarks
5. k6 load tests (`tests/perf/k6/*.js`) — skipped with a warning if k6 is not installed
6. Playwright + Lighthouse audits on all 25 pages — Core Web Vitals (enforced), accessibility score (informational), best-practices score (sustainability proxy)
7. CO₂ per-page report via Website Carbon API — skipped unless `carbon_base_url` is set in `test.config.yaml`

Outputs:
- `/tmp/perf-benchmarks.json` — pytest-benchmark results (timing, min/max/mean per function)
- `/tmp/perf-k6-<script>.log` — k6 output per script
- `app/controlroom_frontend/perf-reports/lighthouse/` — Lighthouse HTML reports per page (includes accessibility and best-practices detail)
- `app/controlroom_frontend/.next-perf/analyze/` — bundle size reports

k6 SLOs: `p95 < 500ms`, `error_rate < 1%`. Lighthouse thresholds: `LCP < 2.5s`, `TBT < 200ms`, `CLS < 0.1`.

To install k6: https://k6.io/docs/get-started/installation/

---

### `scripts/reset-docker.sh`

Stops and removes all project containers. Volumes are preserved.

```bash
./scripts/reset-docker.sh
```

Stops the main stack, dev stack (SonarQube), and any leftover perf/test containers. Run `./build.sh` afterward to bring everything back up.

---

### `scripts/carbon-report.sh`

Calls the [Website Carbon API](https://api.websitecarbon.com) for each of the 25 user-facing pages and prints a CO₂-per-pageview table.

> **Requires a public deployment.** The Website Carbon API fetches each page from their servers and cannot reach localhost or a private network. Until the app is publicly deployed, use the local CO₂ estimates built into `test-perf.sh` instead (see `co2_estimate` annotation in Lighthouse results).

```bash
CARBON_BASE_URL=https://your-app.example.com ./scripts/carbon-report.sh
```

Or set `carbon_base_url` in `test.config.yaml` — it will then run automatically as step 7 of `test-perf.sh`.

Output columns: `Page | Rating (A–F) | CO₂ (g) | Greener than % | Green hosting`

Requirements:
- The base URL must be publicly accessible (the API fetches the page itself; localhost is rejected gracefully)
- `curl` and `python3` must be available
- Pages are fetched sequentially with a 1-second pause to respect the API's rate limit

---

### `scripts/test-precommit.sh`

Runs pre-commit hooks against all files without performing a commit. Useful for verifying the full hook suite is clean during development.

```bash
./scripts/test-precommit.sh              # all hooks
./scripts/test-precommit.sh --ruff       # Python lint only
./scripts/test-precommit.sh --unit-tests # tsc + jest + pytest only
./scripts/test-precommit.sh --bandit     # Python SAST only
./scripts/test-precommit.sh --pip-audit  # Python CVEs only
./scripts/test-precommit.sh --npm-audit  # Node CVEs only
./scripts/test-precommit.sh --detect-secrets  # secrets scan only
```

---

### `scripts/install-hooks.sh`

Installs git pre-commit hooks via the [pre-commit framework](https://pre-commit.com). Run once after cloning. Requires `pre-commit` to be installed (`pip install pre-commit`).

```bash
./scripts/install-hooks.sh
```

---

### `scripts/dev.sh`

Manages the dev tooling stack — SonarQube and Structurizr (separate Docker project from the studio stack).

```bash
./scripts/dev.sh up      # Start dev stack (idempotent — safe to run repeatedly)
./scripts/dev.sh down    # Stop and preserve data
./scripts/dev.sh reset   # Wipe all data and start fresh
./scripts/dev.sh status  # Show running containers
```

`up` performs first-time SonarQube setup automatically (password change, project creation, token generation) and skips steps that are already done. Structurizr starts with no setup required.

| Service | URL |
|---|---|
| SonarQube | `http://localhost:1969` (admin / My@mpGoesTo11) |
| Structurizr | `http://localhost:1967` |

---

### `scripts/test-scan.sh`

Runs the full security suite. Flags can be combined or used independently.

```bash
./scripts/test-scan.sh            # all four checks
./scripts/test-scan.sh --sonar    # SonarQube scan + quality gate only
./scripts/test-scan.sh --trivy    # Trivy container image scan only
./scripts/test-scan.sh --secrets  # detect-secrets audit only
./scripts/test-scan.sh --headers  # HTTP security header assertions only
```

Requires the production stack to be running (`docker compose up -d`). `--sonar` additionally requires the dev stack (`./scripts/dev.sh up`).

Steps performed (full run):
1. **SonarQube** — coverage reports + scanner upload (delegates to `sonar-scan.sh`)
2. **Trivy** — scans both container images for HIGH + CRITICAL CVEs across OS packages and app dependencies (`run-trivy.sh`)
3. **detect-secrets** — audits the working tree against `.secrets.baseline`; fails if new secrets are found
4. **Headers** — `pytest tests/security/test_security_headers.py` asserts `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, and `Permissions-Policy` on all user-facing pages

---

### `scripts/sonar-scan.sh`

Runs coverage reports for both backend and frontend, then uploads to SonarQube. Called internally by `test-scan.sh --sonar`; can also be run directly.

```bash
./scripts/sonar-scan.sh
```

Requires the SonarQube stack to be running (`./scripts/dev.sh up`). Reads the analysis token from `.sonar-token` (generated by `dev.sh up`, gitignored).

Steps performed:
1. `pytest --cov` → `app/controlroom_backend/coverage.xml`
2. `jest --coverage` → `app/controlroom_frontend/coverage/lcov.info`
3. Rewrites LCOV `SF:` paths to project-root-relative (required for SonarQube path matching)
4. Runs `sonar-scanner` in Docker

---

### Hook runner scripts

These are called by the pre-commit framework. You can also run them manually during development.

| Script | Command run | Notes |
|---|---|---|
| `scripts/run-pytest.sh` | `pytest` (backend tests) | Runs against `controlroomdb_test` — requires the DB to be up |
| `scripts/run-jest.sh` | `jest --no-coverage` | Runs all frontend unit tests |
| `scripts/run-tsc.sh` | `tsc --noEmit` | Type-checks the frontend without emitting files |
| `scripts/run-bandit.sh` | `bandit -r app/controlroom_backend` | Python SAST scan; skips B104, B608 (see [setup.md](setup.md)) |
| `scripts/run-pip-audit.sh` | `pip-audit` | Checks Python dependencies for known CVEs |
| `scripts/run-npm-audit.sh` | `npm audit --audit-level=critical` | Checks Node dependencies at critical severity only |
| `scripts/run-trivy.sh` | `trivy image` (via Docker) | Scans both container images for HIGH + CRITICAL CVEs |

---

## util/

The `util/` scripts are the legacy CSV import pipeline. See [legacy.md](legacy.md) for the full workflow.

### `util/studio_csv.sh`

Runs the full CSV pipeline end-to-end: converts raw exports, generates SQL seeds, and reseeds the `studio` database.

```bash
./util/studio_csv.sh
```

### `util/convert_effects.py`

Maps `import/effects.csv` (Google Sheets export) to normalized `csv/effects.csv`.

### `util/convert_instruments.py`

Maps `import/instruments.csv` to normalized `csv/instruments.csv`. Includes parent ID resolution.

### `util/convert_libraries.py`

Maps `import/libraries.csv` to normalized `csv/libraries.csv`.

### `util/convert_models.py`

Maps `import/models.csv` to normalized `csv/models.csv`.

### `util/convert_utility.py`

Shared helpers used by the converter scripts (category dispatch, field normalization, UUID lookups).

### `util/generate_seeds.py`

Reads all normalized CSVs and generates SQL `INSERT` files in `sql/seeds/`. Resolves all lookup values (tag types, effect types, etc.) to UUIDs at generation time. Preserves existing UUIDs on re-runs.

### `util/reseed.py`

Drops and recreates the `studio` database, then applies `sql/schema.sql` and all seed files from `sql/seeds/`.

### `util/diff_effects.py` / `util/diff_models.py`

Compares two CSV snapshots and reports added, removed, or changed rows. Useful for auditing changes between Google Sheets exports before running a full reseed.
