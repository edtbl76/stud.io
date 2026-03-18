# Stats Page Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin-only `/admin/stats` page showing live row counts for every content and lookup table, grouped by Catalog / Session / Tools / Config.

**Architecture:** A new `GET /admin/stats` endpoint in `routers/admin_ops.py` queries 18 table counts in one pass using `get_conn` dependency injection, returns a structured JSON response, and is tested via the standard transaction-rollback test fixture. The frontend is a client component at `app/admin/stats/page.tsx` that mirrors the pattern of `backup/page.tsx`: fetches on mount, shows a spinner while loading, shows an inline error on failure, and renders groups of two-column rows with a comma-formatted total.

**Tech Stack:** FastAPI + asyncpg (backend), Next.js + React + Tailwind CSS (frontend), pytest + httpx (backend tests), Jest + React Testing Library (frontend tests).

**Important — commits:** Do not run `git add` or `git commit`. The user handles all commits. Stage and commit steps are omitted from this plan.

---

## Chunk 1: Backend endpoint + tests

### Task 1: Add Pydantic models and `GET /admin/stats` endpoint

**Files:**
- Modify: `app/controlroom_backend/routers/admin_ops.py`
- Create: `app/controlroom_backend/tests/test_admin_stats.py`

**Context:**
- `admin_ops.py` already imports `APIRouter`, `Depends`, `Annotated`, `require_admin`, `UserOut`, and `asyncpg`. Do not duplicate those imports.
- The `get_conn` dependency is in `database.py` — add `from database import get_conn` to the existing imports.
- The test fixture (`conn`, `client`, `admin_headers`, `auth_headers`) lives in `tests/conftest.py`. The `client` fixture overrides `get_conn` with the test transaction connection, so any endpoint using `get_conn` is automatically covered by the rollback fixture.
- Table name → group mapping (must match spec exactly):

| Group | Display name | Table name |
|---|---|---|
| Catalog | Brands | `brands` |
| Catalog | Models | `models` |
| Session | Effects | `effects` |
| Session | Instruments | `instruments` |
| Session | Libraries | `libraries` |
| Session | Workstations | `workstations` |
| Tools | Admin | `admin_tools` |
| Tools | Composition | `composition_tools` |
| Tools | Measurement | `measurement_tools` |
| Tools | Reference | `reference_tools` |
| Tools | Workflow | `workflow_tools` |
| Config | Effect Types | `effect_types` |
| Config | Entity Types | `entity_types` |
| Config | Instrument Types | `instrument_types` |
| Config | Model Types | `model_types` |
| Config | Plugin Formats | `plugin_formats` |
| Config | Tag Types | `tag_types` |
| Config | Tool Types | `tool_types` |

- Sort order within each group: count descending, then display name ascending as tie-break.
- Group order is fixed: Catalog → Session → Tools → Config.
- `total` is the sum of all 18 counts (does NOT include the `users` table).

- [ ] **Step 1: Write the failing tests**

Create `app/controlroom_backend/tests/test_admin_stats.py`:

```python
# tests/test_admin_stats.py


async def test_stats_requires_auth(client):
    response = await client.get("/admin/stats")
    assert response.status_code == 401


async def test_stats_requires_admin(client, auth_headers):
    response = await client.get("/admin/stats", headers=auth_headers)
    assert response.status_code == 403


async def test_stats_returns_200(client, admin_headers):
    response = await client.get("/admin/stats", headers=admin_headers)
    assert response.status_code == 200


async def test_stats_has_four_groups(client, admin_headers):
    response = await client.get("/admin/stats", headers=admin_headers)
    data = response.json()
    labels = [g["label"] for g in data["groups"]]
    assert labels == ["Catalog", "Session", "Tools", "Config"]


async def test_stats_has_all_18_tables(client, admin_headers):
    response = await client.get("/admin/stats", headers=admin_headers)
    data = response.json()
    all_names = [t["name"] for g in data["groups"] for t in g["tables"]]
    expected = {
        "Brands", "Models",
        "Effects", "Instruments", "Libraries", "Workstations",
        "Admin", "Composition", "Measurement", "Reference", "Workflow",
        "Effect Types", "Entity Types", "Instrument Types",
        "Model Types", "Plugin Formats", "Tag Types", "Tool Types",
    }
    assert set(all_names) == expected


async def test_stats_total_equals_sum_of_counts(client, admin_headers):
    response = await client.get("/admin/stats", headers=admin_headers)
    data = response.json()
    computed = sum(t["count"] for g in data["groups"] for t in g["tables"])
    assert data["total"] == computed


async def test_stats_groups_sorted_by_count_desc(client, admin_headers):
    """Within each group, tables are sorted count desc, then name asc as tie-break."""
    response = await client.get("/admin/stats", headers=admin_headers)
    data = response.json()
    for group in data["groups"]:
        counts = [t["count"] for t in group["tables"]]
        assert counts == sorted(counts, reverse=True)


async def test_stats_count_reflects_inserted_row(client, admin_headers, conn):
    """Inserting a row bumps the relevant table count by 1."""
    before = await client.get("/admin/stats", headers=admin_headers)
    brands_before = next(
        t["count"]
        for g in before.json()["groups"]
        for t in g["tables"]
        if t["name"] == "Brands"
    )

    await conn.execute(
        "INSERT INTO brands (brand_name) VALUES ('__test_brand__')"
    )

    after = await client.get("/admin/stats", headers=admin_headers)
    brands_after = next(
        t["count"]
        for g in after.json()["groups"]
        for t in g["tables"]
        if t["name"] == "Brands"
    )
    assert brands_after == brands_before + 1
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd app/controlroom_backend && python -m pytest tests/test_admin_stats.py -v
```

Expected: all tests fail (404 — endpoint does not exist yet).

- [ ] **Step 3: Add imports and Pydantic models to `admin_ops.py`**

Add `from database import get_conn` to the existing imports at the top of `app/controlroom_backend/routers/admin_ops.py`. Do not duplicate any imports that are already present (`asyncpg`, `Annotated`, etc.).

Then add the Pydantic models after the existing helper functions (`_pg_env`, `_pg_args`, etc.) and before the `@router.get("/backup")` decorator:

```python
# ---------------------------------------------------------------------------
# Stats models
# ---------------------------------------------------------------------------

class TableStat(BaseModel):
    name: str
    count: int


class StatGroup(BaseModel):
    label: str
    tables: list[TableStat]


class StatsResponse(BaseModel):
    groups: list[StatGroup]
    total: int
```

`BaseModel` is from `pydantic` — add `from pydantic import BaseModel` to the imports.

- [ ] **Step 4: Add the `GET /admin/stats` endpoint to `admin_ops.py`**

Add after the Pydantic models (before the backup endpoint):

```python
_STATS_GROUPS: list[tuple[str, list[tuple[str, str]]]] = [
    ("Catalog", [
        ("Brands", "brands"),
        ("Models", "models"),
    ]),
    ("Session", [
        ("Effects", "effects"),
        ("Instruments", "instruments"),
        ("Libraries", "libraries"),
        ("Workstations", "workstations"),
    ]),
    ("Tools", [
        ("Admin", "admin_tools"),
        ("Composition", "composition_tools"),
        ("Measurement", "measurement_tools"),
        ("Reference", "reference_tools"),
        ("Workflow", "workflow_tools"),
    ]),
    ("Config", [
        ("Effect Types", "effect_types"),
        ("Entity Types", "entity_types"),
        ("Instrument Types", "instrument_types"),
        ("Model Types", "model_types"),
        ("Plugin Formats", "plugin_formats"),
        ("Tag Types", "tag_types"),
        ("Tool Types", "tool_types"),
    ]),
]


@router.get("/stats", response_model=StatsResponse)
async def stats(
    _: Annotated[UserOut, Depends(require_admin)],
    conn: Annotated[asyncpg.Connection, Depends(get_conn)],
) -> StatsResponse:
    """Return row counts for all content and lookup tables, grouped by category."""
    groups: list[StatGroup] = []
    total = 0

    for label, table_pairs in _STATS_GROUPS:
        table_stats: list[TableStat] = []
        for display_name, table_name in table_pairs:
            row = await conn.fetchrow(f"SELECT COUNT(*)::int AS cnt FROM {table_name}")
            count = row["cnt"]
            table_stats.append(TableStat(name=display_name, count=count))
            total += count

        table_stats.sort(key=lambda t: (-t.count, t.name))
        groups.append(StatGroup(label=label, tables=table_stats))

    return StatsResponse(groups=groups, total=total)
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd app/controlroom_backend && python -m pytest tests/test_admin_stats.py -v
```

Expected: all 8 tests PASS.

- [ ] **Step 6: Run the full backend test suite**

```bash
cd app/controlroom_backend && python -m pytest
```

Expected: all tests pass. Fix any regressions before continuing.

---

## Chunk 2: Frontend page + sidebar + docs

### Task 2: Add `app/admin/stats/page.tsx`

**Files:**
- Create: `app/controlroom_frontend/app/admin/stats/page.tsx`
- Create: `app/controlroom_frontend/__tests__/app/admin/stats/page.test.tsx`

**Context:**
- The page is a client component (`'use client'`), consistent with `backup/page.tsx` and `users/page.tsx`.
- It fetches `GET /api/admin/stats` on mount via `useEffect`. While loading: centered `Loader2` spinner. On error: `<AlertCircle /> Could not load stats.` inline (same pattern as the error state in `backup/page.tsx`).
- Layout (no search, filters, or pagination):
  - Page heading: `text-lg font-semibold`
  - Each group in a `<section>` with `mb-6`
  - Group label: `text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1`
  - Two-column rows: name left-aligned, count right-aligned in monospace, comma-formatted via `toLocaleString()`
  - `border-t border-border` above the Total row
  - Total row: muted text, right-aligned, comma-formatted
- The `fetch` call goes to `/api/admin/stats` — the Next.js BFF catch-all proxy at `app/api/[...path]/route.ts` handles forwarding to FastAPI with the auth cookie automatically.
- Test mocking follows the `global.fetch = mockFetch` pattern used in `backup/page.test.tsx`. No auth mock needed — the page component makes no direct auth calls.

- [ ] **Step 1: Write the failing test**

Create `app/controlroom_frontend/__tests__/app/admin/stats/page.test.tsx`:

```tsx
import * as React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import StatsPage from '@/app/admin/stats/page'

const mockFetch = jest.fn()
global.fetch = mockFetch

// Mock counts: Catalog 111, Session 917, Tools 63, Config 76 → total 1,167
const mockStatsResponse = {
  groups: [
    {
      label: 'Catalog',
      tables: [
        { name: 'Models', count: 87 },
        { name: 'Brands', count: 24 },
      ],
    },
    {
      label: 'Session',
      tables: [
        { name: 'Libraries', count: 401 },
        { name: 'Effects', count: 312 },
        { name: 'Instruments', count: 198 },
        { name: 'Workstations', count: 6 },
      ],
    },
    {
      label: 'Tools',
      tables: [
        { name: 'Workflow', count: 22 },
        { name: 'Admin', count: 14 },
        { name: 'Measurement', count: 11 },
        { name: 'Composition', count: 9 },
        { name: 'Reference', count: 7 },
      ],
    },
    {
      label: 'Config',
      tables: [
        { name: 'Tag Types', count: 23 },
        { name: 'Effect Types', count: 18 },
        { name: 'Instrument Types', count: 12 },
        { name: 'Tool Types', count: 8 },
        { name: 'Model Types', count: 6 },
        { name: 'Plugin Formats', count: 5 },
        { name: 'Entity Types', count: 4 },
      ],
    },
  ],
  total: 1167,
}

function mockOk(data: object) {
  return {
    ok: true,
    json: () => Promise.resolve(data),
  }
}

function mockErr(detail: string, status = 500) {
  return {
    ok: false,
    status,
    statusText: detail,
    json: () => Promise.resolve({ detail }),
  }
}

describe('StatsPage', () => {
  beforeEach(() => mockFetch.mockReset())

  it('renders all 4 group labels after fetch', async () => {
    mockFetch.mockResolvedValue(mockOk(mockStatsResponse))
    render(<StatsPage />)
    await waitFor(() => expect(screen.getByText('CATALOG')).toBeInTheDocument())
    expect(screen.getByText('SESSION')).toBeInTheDocument()
    expect(screen.getByText('TOOLS')).toBeInTheDocument()
    expect(screen.getByText('CONFIG')).toBeInTheDocument()
  })

  it('renders table display names', async () => {
    mockFetch.mockResolvedValue(mockOk(mockStatsResponse))
    render(<StatsPage />)
    await waitFor(() => expect(screen.getByText('Models')).toBeInTheDocument())
    expect(screen.getByText('Libraries')).toBeInTheDocument()
    expect(screen.getByText('Tag Types')).toBeInTheDocument()
  })

  it('renders comma-formatted total', async () => {
    mockFetch.mockResolvedValue(mockOk(mockStatsResponse))
    render(<StatsPage />)
    await waitFor(() =>
      expect(screen.getByText('1,167')).toBeInTheDocument()
    )
  })

  it('shows Loader2 spinner while fetch is in flight', () => {
    mockFetch.mockImplementation(() => new Promise(() => {}))
    render(<StatsPage />)
    expect(document.querySelector('.lucide-loader-2')).toBeInTheDocument()
  })

  it('shows error message when API returns non-OK response', async () => {
    mockFetch.mockResolvedValue(mockErr('Unauthorized', 401))
    render(<StatsPage />)
    await waitFor(() =>
      expect(screen.getByText(/could not load stats/i)).toBeInTheDocument()
    )
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd app/controlroom_frontend && npm test -- --no-coverage --testPathPattern="stats/page"
```

Expected: FAIL — module `@/app/admin/stats/page` not found.

- [ ] **Step 3: Create the stats page component**

Create `app/controlroom_frontend/app/admin/stats/page.tsx`:

```tsx
'use client'

import * as React from 'react'
import { Loader2, AlertCircle } from 'lucide-react'

interface TableStat {
  name: string
  count: number
}

interface StatGroup {
  label: string
  tables: TableStat[]
}

interface StatsResponse {
  groups: StatGroup[]
  total: number
}

export default function StatsPage() {
  const [data, setData] = React.useState<StatsResponse | null>(null)
  const [error, setError] = React.useState(false)

  React.useEffect(() => {
    fetch('/api/admin/stats')
      .then((res) => {
        if (!res.ok) throw new Error()
        return res.json() as Promise<StatsResponse>
      })
      .then(setData)
      .catch(() => setError(true))
  }, [])

  if (error) {
    return (
      <div className="px-6 py-6">
        <div className="flex items-center gap-2 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
          Could not load stats.
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center px-6 py-6">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="px-6 py-6 max-w-sm">
      <h2 className="text-lg font-semibold text-foreground mb-6">Stats</h2>

      {data.groups.map((group) => (
        <section key={group.label} className="mb-6">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
            {group.label}
          </div>
          {group.tables.map((table) => (
            <div key={table.name} className="flex justify-between text-xs py-0.5">
              <span className="text-foreground">{table.name}</span>
              <span className="font-mono text-muted-foreground">
                {table.count.toLocaleString()}
              </span>
            </div>
          ))}
        </section>
      ))}

      <div className="border-t border-border pt-2 flex justify-between text-xs text-muted-foreground">
        <span>Total</span>
        <span className="font-mono">{data.total.toLocaleString()}</span>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd app/controlroom_frontend && npm test -- --no-coverage --testPathPattern="stats/page"
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Run the full frontend test suite**

```bash
cd app/controlroom_frontend && npm test -- --no-coverage
```

Expected: all tests pass. Fix any regressions before continuing.

- [ ] **Step 6: Run TypeScript check**

```bash
cd app/controlroom_frontend && npx --no tsc --noEmit
```

Expected: no errors.

---

### Task 3: Update Sidebar and docs

**Files:**
- Modify: `app/controlroom_frontend/components/layout/Sidebar.tsx`
- Modify: `app/controlroom_frontend/__tests__/components/layout/Sidebar.test.tsx` (add two test cases to the existing describe block)
- Modify: `docs/arch/api.md`

**Context:**
The ADMIN nav group in `Sidebar.tsx` currently has two items: `Backup & Restore` (href `/admin/backup`) and `Users` (href `/admin/users`). Add `Stats` at `/admin/stats` between them (alphabetical order).

The existing `Sidebar.test.tsx` uses a mutable `mockUseAuth` variable pattern — the mock is set at module level and reset in `beforeEach`. To test admin-only behavior, set `mockUseAuth = () => ({ username: 'admin', role: 'admin', logout: mockLogout })` inside the test, exactly as the existing `'shows ADMIN group for admin users'` test does. Use `fireEvent.click` (not `.click()`) consistently.

- [ ] **Step 1: Write the failing sidebar tests**

Add these two test cases inside the existing `describe('Sidebar', ...)` block in `app/controlroom_frontend/__tests__/components/layout/Sidebar.test.tsx`:

```tsx
  it('renders Stats link in the ADMIN group', () => {
    mockUseAuth = () => ({ username: 'admin', role: 'admin', logout: mockLogout })
    render(<Sidebar />)
    fireEvent.click(screen.getByRole('button', { name: /^ADMIN$/i }))
    expect(screen.getByRole('link', { name: /^stats$/i })).toBeInTheDocument()
  })

  it('renders ADMIN group items in alphabetical order', () => {
    mockUseAuth = () => ({ username: 'admin', role: 'admin', logout: mockLogout })
    render(<Sidebar />)
    fireEvent.click(screen.getByRole('button', { name: /^ADMIN$/i }))
    const adminLinks = screen
      .getAllByRole('link')
      .filter((l) => (l.getAttribute('href') ?? '').startsWith('/admin/'))
    const labels = adminLinks.map((l) => l.textContent)
    expect(labels).toEqual(['Backup & Restore', 'Stats', 'Users'])
  })
```

- [ ] **Step 2: Run the sidebar tests to verify the new cases fail**

```bash
cd app/controlroom_frontend && npm test -- --no-coverage --testPathPattern="Sidebar"
```

Expected: the two new tests FAIL — Stats link not found.

- [ ] **Step 3: Add Stats to the ADMIN nav group in `Sidebar.tsx`**

In `app/controlroom_frontend/components/layout/Sidebar.tsx`, find the ADMIN items array and insert the Stats entry:

```tsx
  {
    title: 'ADMIN',
    items: [
      { label: 'Backup & Restore', href: '/admin/backup' },
      { label: 'Stats', href: '/admin/stats' },
      { label: 'Users', href: '/admin/users' },
    ],
  },
```

- [ ] **Step 4: Run the sidebar tests to verify all pass**

```bash
cd app/controlroom_frontend && npm test -- --no-coverage --testPathPattern="Sidebar"
```

Expected: all tests PASS (including the pre-existing ones).

- [ ] **Step 5: Update `docs/arch/api.md`**

In `docs/arch/api.md`, find the `## Admin operations` section. Add a `### Stats` subsection after the existing `### Verify` entry:

```markdown
### Stats

`GET /admin/stats` — returns row counts for all 18 content and lookup tables grouped by Catalog, Session, Tools, and Config. Tables within each group are sorted by count descending, display name ascending as tie-break. The `total` field is the sum across all groups and excludes the `users` table.
```

- [ ] **Step 6: Run the full test suite and TypeScript check**

```bash
cd app/controlroom_frontend && npm test -- --no-coverage
cd app/controlroom_frontend && npx --no tsc --noEmit
cd app/controlroom_backend && python -m pytest
```

Expected: all tests pass, no TypeScript errors. Fix any failures before stopping.
