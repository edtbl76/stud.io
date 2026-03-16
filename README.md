# STUD.io ControlRoom

A STUD.io application for managing studio gear, plugins, instruments, and sample libraries — with a future Python-powered recommendation engine.

---

## Section 1: Running the Application

### Prerequisites
- Docker + Docker Compose
- Python 3.12+
- [mkcert](https://github.com/FiloSottile/mkcert) (for local HTTPS certificates)

### First-time HTTPS setup

The app runs over HTTPS via an nginx reverse proxy. On a new machine:

```bash
# Install mkcert CA so browsers trust the local cert
mkcert -install

# Generate the certificate (covers localhost + local network hostname)
mkcert -cert-file nginx/certs/cert.pem \
       -key-file  nginx/certs/key.pem \
       localhost 127.0.0.1 192.168.1.230 rogueone rogueone.local 192.168.1.230.sslip.io
```

> The `nginx/certs/` directory is git-ignored — certs must be generated locally on each machine.

### Start everything

```bash
./app.sh
```

This will:
1. Build and start all four containers (`studio_db`, `controlroom_backend`, `controlroom_frontend`, `controlroom_nginx`)
2. Wait for PostgreSQL, API, and frontend to be healthy
3. Apply schema and semantic views to both databases
4. Run the full backend test suite (209 tests)

| Service | Local URL | Network URL |
|---|---|---|
| **App** (Next.js) | `https://localhost:2112` | `https://192.168.1.230.sslip.io:2112` |
| **API** (FastAPI) | `https://localhost:5150` | `https://192.168.1.230.sslip.io:5150` |
| **API Docs** (Swagger) | `https://localhost:5150/docs` | `https://192.168.1.230.sslip.io:5150/docs` |

> First run takes longer — Docker builds the frontend image and `npm install` runs inside the container.

### Accessing from other devices on the network

Use `https://192.168.1.230.sslip.io:2112`. The `sslip.io` domain automatically resolves to `192.168.1.230` — no DNS setup required.

Other devices will see a certificate warning unless you install the mkcert root CA on them. Find it with:
```bash
mkcert -CAROOT
```
Transfer `rootCA.pem` to each device and install it as a trusted certificate authority.

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

### Current State (v1.3)
- PostgreSQL schema fully defined with lookup tables (no ENUMs)
- Semantic view layer (`sql/views.sql`) — 11 views resolving all UUID arrays to `[{id, name}]`, `parent_ids` cross-table, and `full_*_name` computed fields
- FastAPI backend — 209 tests passing, all endpoints live at `http://localhost:5150`
- Full REST API: Brands, Models, Effects, Instruments, Libraries, Workstations, Tools (5 tables), Config (7 lookup tables), Search, Admin (backup/restore), Users
- Next.js frontend — dark studio UI, sortable/filterable/resizable/reorderable data tables, read/edit/create/delete modals, all tables wired to the API
- Row virtualization on large tables (Effects, Instruments, Libraries, Models)
- Navigation: CATALOG, SESSION, TOOLS, CONFIG, ADMIN sections
- Database backup and restore via the Admin UI
- **Auth & RBAC**: JWT authentication with two roles — `admin` (full read/write) and `user` (read-only). Write access is enforced at the API layer; Add/Edit/Delete controls hidden in the UI for non-admins. The ADMIN sidebar section is hidden for non-admins.
- **Google Sign-In** (optional): set `GOOGLE_CLIENT_ID` in `docker-compose.yml` to enable a Google Sign-In button on the login page and a "Link Google" option in the Users admin panel. Leave empty to disable.
- User management UI — add users, change passwords, toggle roles, link Google accounts
- Default credentials: `admin` / `admin` (seeded automatically on first startup, role `admin`)
- **HTTPS**: nginx reverse proxy with mkcert certificates — all traffic encrypted. Accessible on local network via `192.168.1.230.sslip.io` (public TLD resolving to the local IP, accepted by Google OAuth)
- Full stack runs in Docker via `./app.sh`

### Future
- Python recommendation engine (shared FastAPI codebase)
- Google Sheets export
- Migrate nginx reverse proxy to Caddy (simpler config, built-in HTTPS/local CA)

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
