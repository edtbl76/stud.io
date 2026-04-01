# STUD.io ControlRoom — Code Standards

## Python (FastAPI backend)

- **Function length:** max 40 lines (excluding docstring and blank lines)
- **File length:** max 250 lines — split into sub-modules if exceeded
- **Nesting depth:** max 3 levels — flatten with early returns, helpers, or comprehensions
- **Cyclomatic complexity:** max 5 per function
- **Type annotations:** all public function signatures must be fully annotated — no bare `Any`
- **Exception handling:** no bare `except` — catch specific exception types only
- **SQL:** parameterized queries only — no f-string or `.format()` interpolation of user-supplied values
- **No magic numbers:** extract to named module-level constants
- **No commented-out code** in commits

## TypeScript / React (Next.js 16, React 19)

- **No `any`:** use `unknown` and narrow, or type properly — `as unknown as T` casts require an inline comment
- **Component function length:** max 200 lines (JSX included) — extract sub-components or hooks if exceeded
- **File length:** max 400 lines
- **Nesting depth:** max 3 levels — ternaries count as one level; no nested ternaries
- **Cyclomatic complexity:** max 5 per function
- **Named exports:** components use named exports — default exports only for Next.js page files
- **Event handlers:** extract named functions (e.g. `handleSubmit`) — no inline arrow functions longer than a single expression
- **No `useEffect` with suppressed dependencies:** exhaustive dependency arrays only
- **No magic numbers:** extract to named constants
- **No commented-out code** in commits

## Both

- **Duplication:** if the same logic appears twice, extract it — no copy-paste between routers or components
- **New dependencies:** flag any new npm or Python package before adding it
- **New API routes:** document in `docs/arch/api.md`
- **New admin-only routes:** add `test_user_cannot_*` and `test_unauthenticated_cannot_*` in `test_rbac.py`
- **No PostgreSQL ENUMs:** use lookup tables instead

## Test Standards

- Every test must assert real behavior — no coverage-padding tests
- Backend: asyncpg with transaction rollback per test — no mocking the database
- Frontend: mock `@/lib/auth` and `@/lib/api` per project conventions
- Coverage target: 100% on new code, floor is 80%
