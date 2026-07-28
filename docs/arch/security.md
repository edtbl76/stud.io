# Security Architecture

This document describes the security controls in place, why they were chosen, and how to maintain them as the application evolves.

---

## Authentication and session management

The app uses **JWT-in-httpOnly-cookie** via a Backend for Frontend (BFF) pattern:

- The browser never holds a token. `lib/api.ts` makes plain `fetch` calls with no Authorization header.
- The Next.js server reads the `controlroom_token` httpOnly cookie and adds the Bearer header before forwarding requests to FastAPI. The cookie is set with `httpOnly: true`, `secure: true`, `sameSite: lax`, 8-hour `maxAge`.
- FastAPI never receives direct browser requests in normal operation — only calls from the Next.js server over the Docker network.

**Why this matters:** httpOnly cookies cannot be read by JavaScript, so a successful XSS attack cannot exfiltrate the session token. There is no `localStorage` or `sessionStorage` token to steal.

---

## Role-based access control (RBAC)

Two roles: `admin` and `user`.

| Operation | `user` | `admin` |
|---|---|---|
| List any resource | ✓ | ✓ |
| Read any record | ✓ | ✓ |
| View audit history | ✓ | ✓ |
| Create / update / delete any record | ✗ | ✓ |
| Backup / restore | ✗ | ✓ |
| Stats dashboard | ✗ | ✓ |
| Change review writes (acknowledge, undo, delete, bulk acknowledge/undo) | ✗ | ✓ |
| Change review reads | ✓ | ✓ |
| Scanner admin (soft reset, hard reset) | ✗ | ✓ |
| Import / export | ✗ | ✓ |
| User management (create, role change, delete) | ✗ | ✓ |
| List users | ✓ | ✓ |

RBAC is enforced via a `require_admin` FastAPI dependency injected into every write route. The dependency runs before any route handler logic, so unauthenticated requests get 401 and non-admin requests get 403 before any database access occurs.

### Test coverage

`app/controlroom_backend/tests/test_rbac.py` covers every protected surface:

| Section | Tests |
|---|---|
| List access (both roles) | `test_user_can_list_brands`, `_effects`, `_instruments`, `_libraries` |
| Content writes | `test_admin_can_create_brand`, `test_user_cannot_create/patch/delete_brand` |
| Admin backup/restore | `test_admin_can_access_backup`, `test_user_cannot_access_backup`, `test_user_cannot_restore` |
| Admin stats | `test_user_cannot_access_stats`, `test_unauthenticated_cannot_access_stats` |
| Change review writes | `test_user_cannot_acknowledge/undo/delete_change_review` |
| Change review reads | `test_user_can_list_change_review` |
| Change review bulk writes | `test_bulk_acknowledge/undo_requires_admin`, `test_bulk_acknowledge/undo_unauthenticated_returns_401` (in `test_change_review_bulk.py`) |
| Scanner admin | `test_user_cannot_soft/hard_reset`, `test_unauthenticated_cannot_soft/hard_reset` (in `test_rbac.py`) |
| Scanner name aliases (U-19) | `test_user_cannot_create_alias`, `test_unauthenticated_cannot_create_alias` (in `test_rbac.py`) — `POST /scanner/aliases` |
| Import/export | `test_user_cannot_export_xlsx/template`, `test_user_cannot_import` |
| User management | `test_user_cannot_create/change_role/delete_user` |
| Unauthenticated writes | `test_unauthenticated_cannot_write/acknowledge/export/create_user` |

`DUMMY_UUID = "00000000-0000-0000-0000-000000000000"` is used for UUID-parameterized routes — the auth dependency fires before the DB lookup, so the UUID never needs to exist.

**When to add tests:** any new admin-only route needs `test_user_cannot_*` and `test_unauthenticated_cannot_*` cases. Any new user-accessible route that should block unauthenticated access needs `test_unauthenticated_cannot_*`.

---

## HTTP security headers

Applied to every response in `app/studio_frontend/next.config.mjs` via the `headers()` config:

| Header | Value | Purpose |
|---|---|---|
| `X-Frame-Options` | `DENY` | Prevents the app from being embedded in an `<iframe>` (clickjacking) |
| `X-Content-Type-Options` | `nosniff` | Stops browsers from MIME-sniffing responses away from the declared content type |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Limits referrer leakage — sends origin only on cross-origin HTTPS requests |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | Explicitly disables browser APIs the app does not use |

These are asserted on 7 pages by `tests/security/test_security_headers.py` (run via `roadie test scan headers`). The test hits the live stack at `https://localhost:2112` using `requests` with `verify=False` (self-signed mkcert cert).

**When to update:** if a new header is added to `next.config.mjs`, add it to `REQUIRED_HEADERS` in `test_security_headers.py`. If a new page is added, add it to `PAGES`.

---

## Container image scanning (Trivy)

`roadie test scan trivy` scans both container images (`controlroom_backend`, `studio_frontend`) for **HIGH** and **CRITICAL** CVEs using [Trivy](https://trivy.dev), pinned to an immutable digest (`ghcr.io/aquasecurity/trivy:0.72.0@sha256:cffe3f51…`) rather than `:latest` so scans are reproducible. It covers OS packages, Python packages, and npm packages installed in each image.

Trivy runs in an ephemeral container with three mounts:
- `/var/run/docker.sock` — allows Trivy to inspect local images
- `trivy-cache:/root/.cache/trivy` — persistent named volume caching the vulnerability database across runs
- an **image-specific** suppression file — `.trivyignore.backend.yaml` for `controlroom_backend`, `.trivyignore.frontend.yaml` for `studio_frontend` (mounted read-only, passed via `--ignorefile`)

`--exit-code 1` causes the scan to fail on any un-suppressed HIGH/CRITICAL finding.

### CVE suppressions (`.trivyignore.backend.yaml` / `.trivyignore.frontend.yaml`)

Suppressions live in **two per-image** scoped YAML ignore files: `.trivyignore.backend.yaml` (applied only to the `controlroom_backend` scan) and `.trivyignore.frontend.yaml` (applied only to the `studio_frontend` scan). Splitting per image means a suppression justified for one image can never mask a matching package+CVE in the other — the backend file holds only OS/Python/perl/sqlite rules, the frontend file only npm rules. (The earlier single `.trivyignore.yaml`, and before it the flat `.trivyignore`, were retired.) Each rule is **scoped by package** via `purls`, so a CVE ID is never blanket-suppressed across unrelated packages; each carries a `statement` justification and an `expired_at` date after which the suppression lapses and the CVE re-fails the gate, forcing a re-review. The authoritative list and per-rule justifications live in the two files; the table below is a summary:

| CVE / GHSA | Package | Reason |
|---|---|---|
| `CVE-2024-23342` | `ecdsa` (transitive via python-jose) | App uses HS256/HMAC JWTs exclusively — EC keys are not used. No upstream fix. |
| `CVE-2025-69720` | `ncurses` (OS dep, python:3.12-slim) | No fix available in debian 13.4. Not reachable from the application. |
| `CVE-2026-29111` | `systemd` (OS dep, python:3.12-slim) | No fix available. Container runs as non-root (`appuser`). Not reachable. |
| `GHSA-9g9p-9gw9-jx7f`, `GHSA-h25m-26qc-wcjf` | Next.js 14.x | Resolved — upgraded to Next.js 16. |
| `CVE-2024-21538` | `cross-spawn` | npm devDep (jest/playwright tooling). Not in the HTTP request path. |
| `CVE-2025-64756` | `glob` | npm devDep. Not in the HTTP request path. |
| `CVE-2026-26996`, `CVE-2026-27903`, `CVE-2026-27904` | `minimatch` | npm devDeps. Not in the HTTP request path. |
| `CVE-2026-23745`, `CVE-2026-23950`, `CVE-2026-24842`, `CVE-2026-26960`, `CVE-2026-29786`, `CVE-2026-31802` | `node-tar` | npm devDep. Not in the HTTP request path. |
| `CVE-2026-48815` | `sigstore` (bundled in npm CLI, `node:20-alpine`) | Not an app dependency (`npm ls sigstore` is empty); runs only during npm publish/provenance, never in the request path. Not bumpable via `package.json`; resolves when the base image ships npm bundling sigstore ≥ 4.1.1. |
| `CVE-2026-42496`, `CVE-2026-8376`, `CVE-2026-42497`, `CVE-2026-9538`, `CVE-2026-48962` | `perl`, `libperl5.40`, `perl-base`, `perl-modules-5.40` | No fix available in debian trixie. Perl is a runtime dependency required by pg backup tooling. Suppression accepted pending an upstream patch. |

**When to update:** after upgrading base images or dependencies, re-run `roadie test scan trivy`. If new CVEs appear, either fix them (preferred) or add a scoped rule to the ignore file **for the affected image** (`.trivyignore.backend.yaml` or `.trivyignore.frontend.yaml`) — `id` + `purls` (and/or `paths`) + a `statement` justification + an `expired_at` review date. Keep each rule in the file whose image actually ships the package. Revisit existing rules whenever the affected package is upgraded or a rule's `expired_at` lapses — a suppression justified by "no fix available" may no longer apply.

**Trivy DB timing (why a scan can "start" failing with no code change):** the scan result depends on the Trivy vulnerability database, which auto-updates in the shared `trivy-cache` volume. A scan can pass one day and fail the next — with an identical image — simply because the DB learned about a CVE that was always present in the image. This is not a stale build; it means the finding is newly disclosed, not newly introduced. `roadie release` and `roadie test scan` use the same trivy step against the running container, so they agree once both use the same DB. When a scan begins failing unexpectedly, check whether the CVE is newly added to the DB before suspecting a rebuild or cache problem.

---

## Secrets scanning (detect-secrets)

Two layers:

**Pre-commit hook** (`detect-secrets-hook` in `.pre-commit-config.yaml`): scans staged files on every commit against `.secrets.baseline`. Aborts the commit if a new secret is detected. Excludes `package-lock.json`, `.secrets.baseline` itself, `app/studio_frontend/e2e/.auth/`, and `app/studio_frontend/perf-reports/`.

**CI check** (`roadie test scan secrets`): rescans the full working tree (excluding `node_modules`, `.git`, lock files, `.next`, `__pycache__`, and `.secrets.baseline`) and compares against `.secrets.baseline`. Exits 1 if any finding is not in the baseline.

### Baseline management

`.secrets.baseline` contains 17 baselined findings: test fixture passwords, local dev DB credentials (`studio/studio`), and known non-secret high-entropy strings. The CodeScene PAT in `.mcp.json` is also baselined but should be rotated.

To add a new false positive to the baseline:

```bash
detect-secrets scan \
    --exclude-files 'node_modules/.*' \
    --exclude-files '\.git/.*' \
    --exclude-files '.*\.lock$' \
    --exclude-files 'package-lock\.json' \
    --exclude-files '.*\.next/.*' \
    --exclude-files '.*__pycache__.*' \
    --exclude-files '\.secrets\.baseline' \
    --baseline .secrets.baseline
```

This updates `.secrets.baseline` in place. Commit the updated baseline.

---

## Pre-commit security hooks

Eight hooks run before every commit (see `setup.md` for installation):

| Hook | Tool | What it checks |
|---|---|---|
| `ruff` | ruff | Python lint |
| `bandit` | bandit | Python SAST — code-level security issues |
| `pip-audit` | pip-audit | Python dependency CVEs |
| `npm-audit` | npm audit | Node dependency CVEs (critical severity only) |
| `detect-secrets` | detect-secrets | Secrets and credentials in staged files |
| `tsc` | tsc | TypeScript type safety |
| `jest` | jest | Frontend unit tests |
| `pytest` | pytest | Backend unit tests |

`bandit` suppressions: B104 (`0.0.0.0` Docker binding — intentional) and B608 (asyncpg uses f-strings for hardcoded table names only; all values are parameterized). Config in `.bandit`.

`pip-audit` ignores `CVE-2024-23342` — same justification as the Trivy suppression above.

`npm-audit` runs at `--audit-level=critical` only. The two high-severity Next.js CVEs are tracked but suppressed at that severity level.

---

## SonarQube rule suppressions

Rule-level suppressions are configured in `sonar-project.properties` via `sonar.issue.ignore.multicriteria`. Each entry requires a rule key, a resource pattern, and an inline comment explaining the justification.

Current suppressions:

| ID | Rule | Resource | Reason |
|---|---|---|---|
| `e1` | `css:S4662` | `app/studio_frontend/app/globals.css` | `@custom-variant` is a valid Tailwind v4 directive; SonarQube's CSS parser predates it. |

**Note:** `/* NOSONAR */` inline comments are not honoured for CSS rules in SonarQube — `sonar.issue.ignore.multicriteria` is required.

**When to update:** if a SonarQube rule fires on valid framework syntax (not a real issue), add a suppression with justification. Increment the entry ID (`e1`, `e2`, …) for each new suppression.

---

## DeepSource static analysis

DeepSource is a SaaS static-analysis layer that complements SonarQube and CodeScene. It runs in the DeepSource cloud on every pull request (via the DeepSource GitHub app) and posts a check, so it gates PRs in the same trunk-based flow as the rest of `docs/arch/workflow.md` — no local roadie step is required.

Configuration lives in `.deepsource.toml` (repo root), version-controlled so analysis is reproducible:

| Analyzer | Scope |
|---|---|
| `python` | `app/controlroom_backend` (runtime `3.x.x`) |
| `javascript` | `app/studio_frontend` (TypeScript dialect, React plugin, node + browser) |
| `go` | all three modules under `github.com/studiocontrolroom` (`roadie`, `plugin_scanner`, `gearlist_backend`) — `import_root` set to the common namespace; DeepSource auto-detects the sub-paths |
| `secrets` | repo-wide |

`test_patterns` marks the pytest / jest / e2e / `*_test.go` trees as test code; `exclude_patterns` drops `node_modules`, `.next`, `dist`, `coverage`, and `aidlc-docs`.

**Activation (one-time, GitHub app):** install the DeepSource GitHub app on the repo and activate it on deepsource.com. The first analysis runs on the next push/PR.

**Deferred (phase 2):** the `test-coverage` analyzer is commented out — it produces data only once coverage is uploaded via the DeepSource CLI (`deepsource report`), which needs a `DEEPSOURCE_DSN`. Enable it when that upload is wired.

**MCP access:** DeepSource's official MCP server is Team/Enterprise-only, and the community fork (`deepsource-mcp-server`) is deprecated and non-functional. On the free plan we instead query the DeepSource GraphQL API directly: `POST https://api.deepsource.io/graphql/` with `Authorization: Bearer $DEEPSOURCE_API_KEY`, where the token lives in the gitignored root `.env` (`DEEPSOURCE_API_KEY`). Example repo handle: `repository(name:"stud.io", login:"edtbl76", vcsProvider:GITHUB)`.

**Issue suppressions (audited 2026-07-28):**
- **`BAN-B608`** (possible SQL injection, 79 sites) — suppressed via a repo-wide DeepSource dashboard ignore rule. A full trace of all 79 confirmed every interpolated token is a developer-controlled identifier (table/column name from a module constant or an allowlist lookup that raises on unknown keys) and every user-supplied value is a bound `$N` parameter. This mirrors the existing `.bandit` B608 skip and its rationale.
- **`SCT-A000`** (hardcoded secrets, 14 sites) — suppressed inline with `# skipcq: SCT-A000`. None are real leaks: 8 are intentional local-dev credentials in `docker-compose*.yml` (same class as `.secrets.baseline`), and 6 are false positives — Woodpecker `from_secret:` references and Go runtime variables (`cfg.DBPassword`, `token`), not literals.

---

## The security test suite

`roadie test scan` orchestrates all four checks:

```bash
roadie test scan              # all four checks (no gate check)
roadie test scan --gate       # all four checks + SonarQube quality gate verification
roadie test scan sonar        # SonarQube scan only (no gate check)
roadie test scan trivy        # Trivy container scan
roadie test scan secrets      # detect-secrets working tree audit
roadie test scan headers      # HTTP security header assertions
```

Run automatically as part of `roadie release`. Run manually on demand before releases, after base image upgrades, or after adding new dependencies.

Prerequisites: production stack running (`docker compose up -d`). The `sonar` scanner (included in the default run and selectable explicitly) requires the SonarQube dev stack (`roadie start --dev`) and a valid `.sonar-token`. Passing `--gate` additionally polls the SonarQube quality gate API after the scan — this also requires the dev stack and token. `trivy`, `secrets`, and `headers` do not require the dev stack.

---

## Defence-in-depth summary

| Layer | Control |
|---|---|
| Network | nginx TLS termination; FastAPI not directly reachable from browser |
| Session | JWT in httpOnly cookie; immune to XSS token theft |
| Authorization | `require_admin` dependency runs before all write routes; RBAC test coverage |
| Transport headers | `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` |
| Dependencies | pip-audit + npm-audit on every commit; Trivy on container images |
| Secrets | detect-secrets on every commit + full working tree scan |
| Code quality | bandit (SAST) + SonarQube on every scan; CodeScene Code Health + DeepSource on every PR |
