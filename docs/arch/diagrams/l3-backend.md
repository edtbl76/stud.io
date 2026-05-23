# L3 — FastAPI Backend Components

> Components inside the FastAPI Backend container.

```mermaid
graph LR
    subgraph backend ["FastAPI Backend"]
        appcore["App Core"]
        limiter["Rate Limiter"]
        authrouter["Auth Router"]
        catalogrouters["Catalog Routers"]
        sessionrouters["Session Routers"]
        toolsrouter["Tools Router"]
        configrouter["Config Router"]
        searchrouter["Search Router"]
        usersrouter["Users Router"]
        adminrouters["Admin Routers"]
        gearlistrouter["GearList Proxy"]
        scannerrouter["Scanner Router (legacy)"]
        workbenchrouter["Workbench Router"]
        rulesrouter["Rules Router"]
        reportrouter["Report Router"]
        linksrouter["Links Router"]
        rejectionsrouter["Rejections Router"]
        resetrouter["Reset Router"]
        crudlib["CRUD Library"]
        dbpool["DB Pool"]
    end

    db[("PostgreSQL")]
    google(["Google OAuth 2.0"])
    gearlist(["GearList Service"])

    appcore --> limiter
    appcore -->|"/auth"| authrouter
    appcore -->|"/studio/catalog/*"| catalogrouters
    appcore -->|"/studio/session/*"| sessionrouters
    appcore -->|"/studio/tools/{category}"| toolsrouter
    appcore -->|"/studio/config/{slug}"| configrouter
    appcore -->|"/search"| searchrouter
    appcore -->|"/studio/admin/users"| usersrouter
    appcore -->|"/studio/admin"| adminrouters
    appcore -->|"/gearlist/*"| gearlistrouter
    appcore -->|"/scanner (legacy)"| scannerrouter
    appcore -->|"/scanner/workbench"| workbenchrouter
    appcore -->|"/scanner/rules"| rulesrouter
    appcore -->|"/scanner/scans/recent · /scans/{id}/report"| reportrouter
    appcore -->|"/scanner/links"| linksrouter
    appcore -->|"/scanner/results · /rejections"| rejectionsrouter
    appcore -->|"/scanner/admin/reset"| resetrouter
    catalogrouters --> crudlib
    sessionrouters --> crudlib
    toolsrouter --> crudlib
    configrouter --> crudlib
    crudlib --> dbpool
    scannerrouter --> dbpool
    workbenchrouter --> dbpool
    rulesrouter --> dbpool
    reportrouter --> dbpool
    linksrouter --> dbpool
    rejectionsrouter --> dbpool
    resetrouter --> dbpool
    dbpool --> db
    authrouter -->|"validate tokens"| google
    gearlistrouter -->|"X-User / X-Role"| gearlist
```

| Component | Technology | Role |
|---|---|---|
| App Core | FastAPI / Python | CORS, lifespan, pool, admin seed, rate limiter, router mounts |
| Rate Limiter | SlowAPI | Per-user JWT sub key; falls back to client IP |
| Auth Router | FastAPI / Python | JWT (HS256) + Google OAuth; provides `get_current_user` and `require_admin` |
| Catalog Routers | FastAPI / Python | CRUD + history for brands and models |
| Session Routers | FastAPI / Python | CRUD + history for effects, instruments, libraries, workstations |
| Tools Router | FastAPI / Python | CRUD for five tool categories |
| Config Router | FastAPI / Python | CRUD for seven lookup tables; referential integrity on delete |
| Search Router | FastAPI / Python | Full-text search across 11 views; entity typeahead |
| Users Router | FastAPI / Python | User CRUD, role management, Google account linking |
| Admin Routers | FastAPI / Python | Backup, restore, verify, change review, stats, XLSX import/export |
| GearList Proxy | FastAPI / httpx | Catch-all proxy to the GearList Go service |
| Scanner Router (legacy) | FastAPI / Python | Ingest (API key) · report · confirm · keys · exclusions · scan history — coexistence until U-05 |
| Workbench Router | FastAPI / Python | Rules-applied workbench view at `/scanner/workbench` |
| Rules Router | FastAPI / Python | Vendor + name + pattern rule CRUD, toggle, acknowledge-clean |
| Report Router | FastAPI / Python | Recent scan list (`/scanner/scans/recent`) + raw scan report |
| Links Router | FastAPI / Python | Find-link candidates and link creation |
| Rejections Router | FastAPI / Python | Reject match, list rejections, delete rejection |
| Reset Router | FastAPI / Python | Soft reset (disable all rules) and hard reset (full wipe) at `/scanner/admin/reset` |
| CRUD Library | Python | Shared list, get, soft-delete, history, log_audit |
| DB Pool | asyncpg | Connection pool min=2 max=10; provides `get_conn()` dependency |
