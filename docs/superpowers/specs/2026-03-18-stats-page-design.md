# Stats Page Design

## Overview

A read-only admin page at `/admin/stats` showing live row counts for every content and lookup table in `controlroomdb`, grouped by the same categories used in the sidebar navigation. The `users` table is intentionally excluded — user count is surfaced on the Users admin page and is not relevant to catalog statistics.

---

## Backend

### Endpoint

`GET /admin/stats` — admin-only (uses `require_admin` dependency). Added to `routers/admin_ops.py` alongside the existing backup/restore/verify endpoints. Full path: `/admin/stats`.

Uses the `get_conn` dependency injection pattern (not a direct `asyncpg.connect` call) so the test suite can participate via the standard transaction rollback fixture.

Returns row counts for all content and lookup tables in a single response. Each table is queried with `SELECT COUNT(*)::int`. No joins, no views — base tables only.

### Display name → table name mapping

The backend queries actual table names and maps them to display names in the response:

| Group    | Display name     | Table name           |
|----------|------------------|----------------------|
| Catalog  | Brands           | `brands`             |
| Catalog  | Models           | `models`             |
| Session  | Effects          | `effects`            |
| Session  | Instruments      | `instruments`        |
| Session  | Libraries        | `libraries`          |
| Session  | Workstations     | `workstations`       |
| Tools    | Admin            | `admin_tools`        |
| Tools    | Composition      | `composition_tools`  |
| Tools    | Measurement      | `measurement_tools`  |
| Tools    | Reference        | `reference_tools`    |
| Tools    | Workflow         | `workflow_tools`     |
| Config   | Effect Types     | `effect_types`       |
| Config   | Entity Types     | `entity_types`       |
| Config   | Instrument Types | `instrument_types`   |
| Config   | Model Types      | `model_types`        |
| Config   | Plugin Formats   | `plugin_formats`     |
| Config   | Tag Types        | `tag_types`          |
| Config   | Tool Types       | `tool_types`         |

The sidebar's ADMIN group (Backup, Stats, Users) has no corresponding stats group — those are operational pages, not catalog data.

### Response shape

```json
{
  "groups": [
    {
      "label": "Catalog",
      "tables": [
        { "name": "Models", "count": 87 },
        { "name": "Brands", "count": 24 }
      ]
    },
    {
      "label": "Session",
      "tables": [
        { "name": "Libraries",    "count": 401 },
        { "name": "Effects",      "count": 312 },
        { "name": "Instruments",  "count": 198 },
        { "name": "Workstations", "count": 6   }
      ]
    },
    {
      "label": "Tools",
      "tables": [
        { "name": "Workflow",    "count": 22 },
        { "name": "Admin",       "count": 14 },
        { "name": "Measurement", "count": 11 },
        { "name": "Composition", "count": 9  },
        { "name": "Reference",   "count": 7  }
      ]
    },
    {
      "label": "Config",
      "tables": [
        { "name": "Tag Types",         "count": 23 },
        { "name": "Effect Types",      "count": 18 },
        { "name": "Instrument Types",  "count": 12 },
        { "name": "Model Types",       "count": 6  },
        { "name": "Plugin Formats",    "count": 5  },
        { "name": "Tool Types",        "count": 8  },
        { "name": "Entity Types",      "count": 4  }
      ]
    }
  ],
  "total": 1109
}
```

Tables within each group are sorted by count descending, with display name ascending as the tie-break. Group order is fixed: Catalog → Session → Tools → Config. `total` is the sum of all counts across all groups (does not include `users`).

### Pydantic models

```python
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

---

## Frontend

### Component choice

`app/admin/stats/page.tsx` is a **client component** (`'use client'`), consistent with all other admin pages in this app (`backup`, `users`). Introducing a server component here would be an inconsistency without clear benefit — this page has no SEO requirement and the data is always user-specific (admin-gated).

Fetches `GET /api/admin/stats` on mount via `useEffect`. While the page is loading, displays a centered `Loader2` spinner. On error, displays an inline error message in place of the content.

### Layout

```
Stats                          ← page heading (text-lg font-semibold)

CATALOG
Models                    87
Brands                    24

SESSION
Libraries                401
Effects                  312
...

TOOLS
...

CONFIG
...

────────────────────────────
Total                  1,109   ← muted, right-aligned, comma-formatted
```

Each group rendered as a `<section>` with:
- Group label: `text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1`
- Two-column rows: name left-aligned, count right-aligned in monospace, comma-formatted
- `mb-6` spacing between groups
- Thin `border-t border-border` above the total line

No search, no filters, no pagination.

### Error state

Replaces the entire content area with:
```
<AlertCircle /> Could not load stats.
```
Same pattern as the error states in `backup/page.tsx`.

### Navigation

`components/layout/Sidebar.tsx` admin group updated (alphabetical order):
```
Backup & Restore   → /admin/backup
Stats              → /admin/stats
Users              → /admin/users
```

---

## Documentation

`docs/arch/api.md` updated to add `GET /admin/stats` to the Admin operations section.

---

## Testing

### Backend — `tests/test_admin_stats.py`

- Authenticated admin request returns 200 with the correct group/table structure
- All 18 expected table names are present across the 4 groups
- `total` equals the sum of all table counts
- Non-admin request (user role) returns 403
- Unauthenticated request returns 401
- Counts reflect actual table state: insert a row into `brands`, verify the Brands count in the response increments by 1 (works because endpoint uses `get_conn` and shares the test transaction)

### Frontend — `__tests__/app/admin/stats/page.test.tsx`

- Renders all 4 group labels from mocked API response
- Renders table display names and counts correctly
- Renders comma-formatted total
- Shows `Loader2` spinner while fetch is in flight
- Shows error message when API returns a non-OK response (does not crash)

---

## Out of Scope

- Historical trends / time-series counts
- Auto-refresh / polling
- Per-table drill-down
- Export
- `users` table count (available on the Users page)
