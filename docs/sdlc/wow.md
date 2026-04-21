# Workflow, Versioning, and Release (WoW) Guidelines

This is the source of truth for how we plan, execute, and release work.

## Workflow Rules

* Backlog is the source of truth
* Order is preserved unless explicitly changed
* Work is pulled into In Progress intentionally
* Only a small number of items should be In Progress at once

---

## Versioning

Format: MAJOR.MINOR.PATCH

* PATCH (x.x.THIS)

    * Every item moved to Done

* MINOR (x.THIS.x)

    * Meaningful feature completion (e.g. v0.3.0)

* MAJOR (THIS.x.x)

    * Large milestone / phase shift

---

## Release Process

1. Complete tasks → move to Done → increment PATCH
2. When release scope is satisfied → bump MINOR
3. Archive Done into release notes (optional file)
4. Clear Done
5. Set next release target

---

## Testing

### Test suite

Every change requires tests. Run the full suite before marking work done:

```bash
roadie test unit    # tsc + jest + ruff + bandit + pytest
roadie test e2e     # Playwright E2E (sharded)
roadie test perf    # performance suite (on demand — not required for every change)
roadie test scan    # security suite (on demand — Sonar, Trivy, secrets, headers)
```

Coverage target is 100% on new code; 80% is the hard floor. Do not game coverage with meaningless assertions.

### Database isolation

Three databases live in the same PostgreSQL container (`studio_db`):

| Database | Purpose |
|---|---|
| `masterdb` | **Production** — used by the live application |
| `masterdb_test` | **Tests** — used exclusively by the automated test suite |
| `studio` | **Legacy** — target for the CSV import pipeline |

Tests **never** touch `masterdb`. Isolation is enforced at two levels:

**Unit tests (pytest)** connect directly to `masterdb_test` via asyncpg. Every test runs inside a transaction that is rolled back after the test completes — no data persists between tests. The `conftest.py` fixture wires this up automatically.

**E2E tests (Playwright)** use a separate `controlroom_backend_test` Docker container (port 5151) whose `DB_NAME` is set to `masterdb_test`. Playwright hits this container instead of the production backend. The container is removed and recreated fresh on each run.

The production backend (`controlroom_backend`, port 5150) always points at `masterdb` and is never contacted by any test.

### Performance tests

The perf suite is run on demand — not part of the standard build:

```bash
roadie test perf
```

What it covers:
- **k6**: API load tests for catalog, search, and change-review endpoints (`p95 < 500ms`, `error_rate < 1%`)
- **pytest-benchmark**: 14 function benchmarks covering hot paths (list queries, search, xlsx build/parse, audit log)
- **EXPLAIN plan assertions**: verify GIN trgm indexes exist; verify PK lookups use Index Scan
- **Lighthouse**: Core Web Vitals for all 24 pages (`LCP < 2.5s`, `TBT < 200ms`, `CLS < 0.1`)
- **Bundle analyzer**: `@next/bundle-analyzer` report generated during the production build

When to run it: before a release, after a schema change that touches indexed columns, or after adding a significant new feature.

When to update the perf suite: see the "Performance tests" section of `CLAUDE.md`.

### Security scans

The security suite is run on demand — automatically included in `roadie release`:

```bash
roadie test scan
```

What it covers:
- **SonarQube**: SAST, code quality, and coverage gate
- **Trivy**: container image scan for OS-level and app dependency CVEs (HIGH + CRITICAL)
- **detect-secrets**: working tree audit against `.secrets.baseline`
- **HTTP headers**: asserts `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, and `Permissions-Policy` on all user-facing pages

When to run it: before a release, after updating base Docker images, or after adding new dependencies.

When to update the security suite: see the "Security scans" section of `CLAUDE.md`.

---

### Quality gate

The SonarQube quality gate must pass before handing off any solution:

```bash
roadie build --dev
```

Gate thresholds:
- Zero new violations on new/changed code
- ≥ 80% line coverage on new/changed code
- < 3% duplicated lines on new/changed code

Pre-commit hooks (enforced on every commit): `ruff`, `pytest`, `tsc`, `jest`, `bandit`, `pip-audit`, `npm-audit`, `detect-secrets`. Never bypass with `--no-verify`.

### Release gate

Before tagging a release, run the full gate:

```bash
roadie release
```

This runs unit tests, all four security scans (Sonar + Trivy + secrets + headers), the SonarQube quality gate, E2E tests, and the performance suite — in that order. Each stage must pass before the next runs.

---

## Notes

* Priority is encoded via tags (#P0 → #P3)
* P0 defines current focus
* Epics are not started until foundation is stable
* This file is the control surface for planning and execution