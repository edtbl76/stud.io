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
cd app/controlroom_backend && python -m pytest                        # backend unit tests
cd app/controlroom_frontend && npm test -- --no-coverage              # frontend unit tests
cd app/controlroom_frontend && npx tsc --noEmit                       # TypeScript type check
cd app/controlroom_frontend && npx playwright test                    # E2E tests
```

Coverage target is 100% on new code; 80% is the hard floor. Do not game coverage with meaningless assertions.

### Database isolation

Three databases live in the same PostgreSQL container (`studio_db`):

| Database | Purpose |
|---|---|
| `controlroomdb` | **Production** — used by the live application |
| `controlroomdb_test` | **Tests** — used exclusively by the automated test suite |
| `studio` | **Legacy** — target for the CSV import pipeline |

Tests **never** touch `controlroomdb`. Isolation is enforced at two levels:

**Unit tests (pytest)** connect directly to `controlroomdb_test` via asyncpg. Every test runs inside a transaction that is rolled back after the test completes — no data persists between tests. The `conftest.py` fixture wires this up automatically.

**E2E tests (Playwright)** use a separate `controlroom_backend_test` Docker container (port 5151) whose `DB_NAME` is set to `controlroomdb_test`. Playwright hits this container instead of the production backend. The container is removed and recreated fresh on each run.

The production backend (`controlroom_backend`, port 5150) always points at `controlroomdb` and is never contacted by any test.

### Quality gate

The SonarQube quality gate must pass before handing off any solution:

```bash
./build.sh --dev
```

Gate thresholds:
- Zero new violations on new/changed code
- ≥ 80% line coverage on new/changed code
- < 3% duplicated lines on new/changed code

Pre-commit hooks (enforced on every commit): `ruff`, `pytest`, `tsc`, `jest`, `bandit`, `pip-audit`, `npm-audit`. Never bypass with `--no-verify`.

---

## Notes

* Priority is encoded via tags (#P0 → #P3)
* P0 defines current focus
* Epics are not started until foundation is stable
* This file is the control surface for planning and execution