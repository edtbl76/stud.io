# L3 — GearList Service Components

> Components inside the GearList Service container.

```mermaid
graph LR
    subgraph gearlist ["GearList Service"]
        server["Server"]
        gearhandler["Gear Handler"]
        geartypeshandler["GearTypes Handler"]
        maintenancehandler["Maintenance Handler"]
        photouploader["Photo Uploader"]
        auditstore["Audit Store"]
        config["Config"]
    end

    db[("PostgreSQL")]
    minio[("MinIO")]
    backend(["FastAPI Backend"])

    backend -->|"X-User / X-Role"| server
    server -->|"/gear/*"| gearhandler
    server -->|"/gear-types/*"| geartypeshandler
    server -->|"/gear/{id}/maintenance"| maintenancehandler
    gearhandler --> photouploader
    gearhandler --> auditstore
    geartypeshandler --> auditstore
    photouploader -->|"PutObject / RemoveObject"| minio
    gearhandler -->|"gear + gear_view"| db
    geartypeshandler -->|"gear_types"| db
    maintenancehandler -->|"gear_maintenance_log"| db
    auditstore -->|"audit_log"| db
```

| Component | Technology | Role |
|---|---|---|
| Server | Go / net/http | HTTP router, middleware chain, health check |
| Gear Handler | Go / pgx | CRUD for gear items; paginated list with name and type filtering |
| GearTypes Handler | Go / pgx | CRUD for the gear_types lookup table |
| Maintenance Handler | Go / pgx | Append-only maintenance event log per gear item |
| Photo Uploader | Go / minio-go | Validates Content-Type and size; uploads to MinIO; rolls back on DB failure |
| Audit Store | Go / pgx | Writes CREATE, UPDATE, DELETE entries to the shared audit_log |
| Config | Go | Loads APP_PORT, DB credentials, MinIO credentials from environment |
