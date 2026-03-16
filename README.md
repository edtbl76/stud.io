# STUD.io

A local web application for managing studio gear, plugins, instruments, and sample libraries — with a future Python-powered recommendation engine.

---

## Section 1: Running the Application

### Prerequisites
- Docker + Docker Compose
- Python 3.12+

### Infrastructure

**Start everything (Docker containers + run backend tests):**
```bash
./app.sh
```

This will:
1. Start the `controlroom_db` (PostgreSQL) and `controlroom_backend` (API server) containers
2. Run the full backend test suite

**API server** runs at `http://localhost:5150`

---

### CSV Pipeline (legacy data refresh)

To re-run the CSV import pipeline and reseed the `studio` database:
```bash
./util/studio_csv.sh
```

---

### Databases

| Database | Purpose |
|---|---|
| `studio` | Legacy CSV pipeline target — source of truth for import data |
| `controlroomdb` | Application database — used by the API and UI |
| `controlroomdb_test` | Test database — used by the automated test suite |

All three databases live in the same PostgreSQL container (`studio_db`) on port `5432`.

---

## Section 2: Application Roadmap

### Current State
- PostgreSQL schema fully defined with lookup tables (no ENUMs)
- Semantic view layer in place (`sql/views.sql`) — all UUID arrays resolved to `[{id, name}]` objects, `parent_ids` resolved cross-table, `full_*_name` computed
- FastAPI backend running on port `5150` in Docker
- Test infrastructure in place (pytest + asyncio, real DB, transaction rollback isolation)
- **Brands** router fully implemented and tested (15 tests)

### In Progress
- **Backend API**: REST endpoints for Models, Effects, Instruments, Libraries, Workstations, Tools, Config (lookup tables), Search
- **Auth**: Simple JWT username/password login

### Planned
- **Frontend**: Next.js + React + Tailwind + shadcn/ui
- **Navigation**: Four sections — CATALOG, SESSION, TOOLS, CONFIG
- **List Views**: Sortable/filterable data tables with bulk actions
- **Record Modals**: Read-only and edit mode in a single modal, with clickable brand/model/parent references
- **Global Search**: Full-database search bar in the header with a toggle to scope to the current list view
- **Config Section**: UI management of all lookup tables (tag types, effect types, instrument types, etc.) — no schema migrations required

### Future
- Python recommendation engine (shared FastAPI codebase)
- Google Sheets export

---

## Section 3: Legacy CSV Workflow

The original data pipeline imports studio gear data from Google Sheets exports into PostgreSQL via a series of Python converter scripts.

### Flow

```
Google Sheets exports (import/*.csv)
        ↓
  Converter scripts (util/)
        ↓
  Normalized CSVs (csv/)
        ↓
  Seed generator (generate_seeds.py)
        ↓
  SQL seed files (sql/seeds/)
        ↓
  reseed.py → studio database
```

### Scripts

| Script | Purpose |
|---|---|
| `util/convert_effects.py` | Maps Effects sheet → `csv/effects.csv` |
| `util/convert_instruments.py` | Maps Instruments sheet → `csv/instruments.csv` |
| `util/convert_libraries.py` | Maps Libraries sheet → `csv/libraries.csv` |
| `util/convert_models.py` | Maps Models sheet → `csv/models.csv` |
| `util/generate_seeds.py` | Reads all CSVs, generates SQL INSERT files in `sql/seeds/` |
| `util/reseed.py` | Drops and recreates the `studio` database, applies schema + seeds |
| `util/studio_csv.sh` | Runs the full pipeline end-to-end |

### Notes
- Converters preserve existing UUIDs on re-runs — records are stable across imports
- All ENUM values (tag types, effect types, etc.) are resolved to lookup table UUIDs at seed generation time
- The `studio` database is the CSV pipeline target and is kept separate from `controlroomdb`, which is managed exclusively through the application going forward
