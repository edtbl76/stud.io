# Scripts Reference

All scripts live in `scripts/` (dev tooling and hook runners) or `util/` (legacy CSV pipeline).

For the overall development workflow (branches, PRs, CI gate, pre-merge checklist), see [`docs/arch/workflow.md`](arch/workflow.md).

---

## scripts/

### `build.sh` *(project root — superseded)*

> **Superseded by `roadie build`.** `build.sh` is retained for CI compatibility but is no longer the recommended local development entry point. Use `roadie build` instead (see [`docs/arch/roadie.md`](arch/roadie.md)).

```bash
roadie build              # recommended: rebuild images, apply schema, run unit tests
roadie build --e2e        # also run Playwright E2E shards
roadie build --dev        # include dev overlay (SonarQube + Structurizr)
roadie build --skip-tests # rebuild images and apply schema only
roadie release            # full release gate: rebuild dev stack + unit + E2E + scan + perf
```

---

### `scripts/test-unit.sh` *(superseded)*

> **Superseded by `roadie test unit`.** Use `roadie test unit` instead. The script is retained for CI compatibility.

---

### `scripts/test-scan.sh` *(superseded as entry point)*

> **Superseded by `roadie test scan`.** Use `roadie test scan [sonar|trivy|secrets|headers] [--gate]` instead. The script is retained and called internally by Roadie's SonarScanStep.

---

### `scripts/test-perf.sh`

Runs the full performance test suite via `roadie test perf`. Not part of the standard build — run on demand when you want to measure performance or validate SLOs.

```bash
roadie test perf                           # all suites (includes production Next.js build)
roadie test perf bundle                    # bundle analysis only (steps 1–3)
roadie test perf benchmarks                # pytest benchmarks + EXPLAIN plans only
roadie test perf --no-bundle               # all suites, skip build (reuse existing .next-perf)
```

Note: subtype selectors (`bundle`, `benchmarks`, `k6`, `lighthouse`) are mutually exclusive — each runs only that suite. Pass at most one.

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

k6 SLOs: `p95 < 500ms`, `error_rate < 1%`. Lighthouse thresholds: `LCP` warn at 2.5s / hard fail at 4.0s, `TBT < 200ms`, `CLS < 0.1`. Pages with LCP in the 2.5–4.0s band produce a `lcp-warning` annotation in the Playwright HTML report and surface as `WARN` in the Performance Summary; they do not fail the build. Pages above 4.0s fail.

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
./scripts/test-scan.sh              # all four checks (includes sonar gate)
./scripts/test-scan.sh --sonar      # SonarQube scan only (no gate check)
./scripts/test-scan.sh --sonar-gate # SonarQube scan + quality gate verification
./scripts/test-scan.sh --trivy      # Trivy container image scan only
./scripts/test-scan.sh --secrets    # detect-secrets audit only
./scripts/test-scan.sh --headers    # HTTP security header assertions only
```

Requires the production stack to be running (`docker compose up -d`). `--sonar` and `--sonar-gate` additionally require the dev stack (`./scripts/dev.sh up`).

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

These are called by the pre-commit framework. `run-pytest.sh`, `run-jest.sh`, and `run-tsc.sh` are superseded as standalone commands by `roadie test unit` — they are retained only for the pre-commit hook runner.

| Script | Command run | Notes |
|---|---|---|
| `scripts/run-pytest.sh` *(hook only)* | `pytest` (backend tests) | Use `roadie test unit pytest` outside of hooks |
| `scripts/run-jest.sh` *(hook only)* | `jest --no-coverage` | Use `roadie test unit jest` outside of hooks |
| `scripts/run-tsc.sh` *(hook only)* | `tsc --noEmit` | Use `roadie test unit tsc` outside of hooks |
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
