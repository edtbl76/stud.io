workspace "STUD.io ControlRoom" "C4 architecture model for the ControlRoom music production catalog application." {

    model {

        # ── Persons ───────────────────────────────────────────────────────────

        admin = person "Studio Owner" {
            description "Manages the full catalog: creates, edits, and deletes brands, models, effects, instruments, libraries, and tools. Runs backups, imports, and reviews audit changes. Has admin role."
            tags "Admin"
        }

        viewer = person "User" {
            description "Browses and searches the catalog. Can view records and audit history. Cannot modify data."
            tags "User"
        }

        # ── External Systems ──────────────────────────────────────────────────

        google = softwareSystem "Google OAuth 2.0" {
            description "Provides user identity for Google Sign-In. The backend validates ID tokens via the google-auth library; the frontend displays the sign-in button via the Google Identity Services SDK."
            tags "External"
        }

        # ── Software System ───────────────────────────────────────────────────

        controlRoom = softwareSystem "STUD.io ControlRoom" {
            description "A private catalog for managing music production hardware, software, and tools. Supports browsing, search, CRUD, audit logging, and admin operations."

            # ── Nginx ────────────────────────────────────────────────────────

            nginx = container "Nginx" {
                description "TLS termination and reverse proxy. Routes HTTPS traffic on port 2112 to the Next.js frontend and on port 5150 to the FastAPI backend. Passes WebSocket upgrade headers for Next.js HMR. Serves mkcert-generated certificates."
                technology "nginx:alpine"
                tags "Infrastructure"
            }

            # ── Frontend ─────────────────────────────────────────────────────

            frontend = container "Next.js Frontend" {
                description "Server-rendered React application using the App Router. Implements the BFF (Backend for Frontend) pattern — the browser communicates only with Next.js. JWTs are stored in httpOnly cookies and never exposed to JavaScript."
                technology "Node 20 / Next.js 14 / TypeScript / React 18"
                tags "Frontend"

                bffProxy = component "BFF Catch-All Proxy" {
                    description "Intercepts every /api/* request from client code. Reads the controlroom_token httpOnly cookie and attaches Authorization: Bearer {token} before forwarding to FastAPI. This is the only place the JWT enters an HTTP header — the browser itself never sees the token."
                    technology "app/api/[...path]/route.ts"
                    tags "BFF"
                }

                authRoutes = component "Auth API Routes" {
                    description "Handles username/password login (POST /api/auth/token), Google SSO login (POST /api/auth/google), and logout (POST /api/auth/logout). On login, exchanges credentials with FastAPI then sets the controlroom_token httpOnly cookie (httpOnly, secure, sameSite=lax, 8-hour maxAge). On logout, deletes the cookie."
                    technology "app/api/auth/"
                    tags "BFF"
                }

                authContext = component "Auth Context" {
                    description "Provides username and role to all client components via React context. On mount, checks for an existing session via GET /api/auth/me. Redirects unauthenticated users to /login; redirects authenticated users away from /login."
                    technology "lib/auth.tsx"
                    tags "Library"
                }

                apiClient = component "API Client" {
                    description "Typed fetch wrapper with methods for list, listPaged, get, create, update, delete, and searchGlobal. All calls target relative /api/... paths — no Authorization header is set by client code. The browser sends the httpOnly cookie automatically."
                    technology "lib/api.ts"
                    tags "Library"
                }

                tablePageFramework = component "TablePage Framework" {
                    description "Generic CRUD page container used by all 18 data tables. Manages server-side pagination via useInfiniteQuery, per-column filtering (350ms debounce, 2-char minimum), sorting, bulk edit bar (admin only), and modal dispatch on row click. Query invalidation on mutation triggers automatic refetch."
                    technology "components/TablePage.tsx + DataTable.tsx"
                    tags "UI"
                }

                modalSystem = component "Modal System" {
                    description "RecordModal shell supporting view, edit, history, and two-stage delete modes. Eight domain-specific modals (BrandModal, ModelModal, EffectModal, InstrumentModal, LibraryModal, WorkstationModal, ToolModal, ConfigModal) each compose RecordModal and own their form state. RecordHistoryView renders the full audit trail with field-level diffs and undo."
                    technology "components/RecordModal.tsx + components/tables/"
                    tags "UI"
                }

                pages = component "Pages" {
                    description "25 page files across 6 domains: login, catalog (brands, models), session (effects, instruments, libraries, workstations), tools (workflow, measurement, reference, composition, admin), config (7 lookup tables), search, and admin (stats, change-review, backup, import/export, users)."
                    technology "app/"
                    tags "UI"
                }
            }

            # ── Backend ──────────────────────────────────────────────────────

            backend = container "FastAPI Backend" {
                description "REST API providing CRUD for all catalog entities, global full-text search, audit logging, and admin operations. All mutations require admin role. All database access is asynchronous via asyncpg."
                technology "Python 3.12 / FastAPI / asyncpg / Uvicorn"
                tags "Backend"

                appCore = component "App Core" {
                    description "FastAPI application entry point. Registers CORSMiddleware (allowed origin: https://localhost:2112), manages asyncpg pool lifecycle via lifespan context, seeds the default admin account on startup, and mounts 14 routers."
                    technology "main.py"
                    tags "Application"
                }

                configModule = component "Configuration" {
                    description "Pydantic Settings loaded from environment variables: DB credentials, JWT secret and algorithm (HS256), token expiry (480 min), Google OAuth client ID, and server bind address. Exposes db_dsn computed property."
                    technology "config.py"
                    tags "InfrastructureComponent"
                }

                dbPool = component "Database Pool" {
                    description "asyncpg connection pool (min=2, max=10) with JSON/JSONB codec registration for automatic dict serialisation. Exposes get_conn() as a FastAPI dependency injected into every route that needs database access."
                    technology "database.py"
                    tags "InfrastructureComponent"
                }

                authRouter = component "Auth Router" {
                    description "JWT authentication via HS256 and Google OAuth ID token validation. Exposes /auth/token, /auth/me, and /auth/google. Provides two reusable FastAPI dependencies: get_current_user (validates and decodes JWT) and require_admin (additionally checks role=admin). All protected routes declare one of these as a Depends parameter."
                    technology "routers/auth.py"
                    tags "Router"
                }

                usersRouter = component "Users Router" {
                    description "User account management: list all users, create (admin), change own password, change role (admin), link/unlink Google account, delete (admin). Enforces last-admin protection and email uniqueness."
                    technology "routers/users.py"
                    tags "Router"
                }

                searchRouter = component "Search Router" {
                    description "Global full-text search via PostgreSQL websearch_to_tsquery across 11 catalog views (brands, models, effects, instruments, libraries, workstations, and 5 tool categories). Optional notes field search. Returns rank-sorted results grouped by table."
                    technology "routers/search.py"
                    tags "Router"
                }

                catalogRouters = component "Catalog Routers" {
                    description "Six routers managing content entities: brands, models, effects, instruments, libraries, workstations. All expose paginated list (with per-column filtering and sorting), single get, create/update/soft-delete (admin only), and audit history. Effects, instruments, and libraries support parent_ref hierarchical relationships and model associations."
                    technology "routers/brands|models|effects|instruments|libraries|workstations.py"
                    tags "Router"
                }

                toolsRouter = component "Tools Router" {
                    description "Unified CRUD interface for 5 tool categories: workflow, measurement, reference, composition, admin. Normalises per-table primary keys to a common tool_id for a consistent API surface. Measurement and reference tools can be associated with hardware models."
                    technology "routers/tools.py"
                    tags "Router"
                }

                configRouter = component "Config Router" {
                    description "CRUD for 7 lookup/enumeration tables (entity_types, tag_types, plugin_formats, model_types, effect_types, instrument_types, tool_types). Maps URL slugs (e.g. entity-types) to table names. Enforces referential integrity before deletes."
                    technology "routers/config.py"
                    tags "Router"
                }

                adminRouters = component "Admin Routers" {
                    description "Four admin-only routers mounted under /admin: change_review (audit log browser with acknowledge and undo to old_data snapshot), admin_stats (row counts per table and pending audit counts), backup_ops (pg_dump streaming response with manifest checksums and psql restore), import_export (XLSX bulk import/export up to 10MB)."
                    technology "routers/change_review|admin_stats|backup_ops|import_export.py"
                    tags "Router"
                }

                crudLibrary = component "CRUD & Audit Library" {
                    description "Shared abstractions used by all catalog and config routers: list_entities (paginated with filter/sort DSL), get_entity (404 on miss), delete_entity (soft-delete with audit snapshot), get_history (audit trail for a record). Filter DSL supports contains (ILIKE), equals, fuzzy (pg_trgm similarity), is_empty, and date operators. log_audit writes old_data/new_data JSON snapshots to audit_log."
                    technology "routers/_crud_ops.py + _helpers.py + filter_operators.py"
                    tags "Library"
                }

                xlsxLibrary = component "XLSX Library" {
                    description "Generates and parses XLSX workbooks for the import/export router. TABLE_CONFIGS defines per-table schema (columns, validators, lookup references). fetch_lookup_data and build_workbook produce export files; parse_workbook, validate_import, and execute_import handle bulk ingest with audit logging."
                    technology "routers/_xlsx_schema|_build|_import.py"
                    tags "Library"
                }
            }

            # ── Database ─────────────────────────────────────────────────────

            database = container "PostgreSQL" {
                description "Primary data store. Three logical databases: controlroomdb (production app), controlroomdb_test (automated test suite — each test runs in a rolled-back transaction), studio (legacy CSV pipeline). pgvector extension installed for future vector similarity. Semantic views (brands_view, models_view, etc.) used for reads; base tables for writes. audit_log table records every CREATE, UPDATE, and DELETE with old_data/new_data JSON snapshots."
                technology "pgvector/pgvector:pg17"
                tags "Database"
            }

            # ── Dev tooling ──────────────────────────────────────────────────

            sonarqube = container "SonarQube" {
                description "SAST, code quality metrics, and coverage gate. Runs as a separate Docker project (not part of the production stack). Quality gate thresholds: zero new violations, ≥80% line coverage, <3% duplication on new/changed code."
                technology "sonarqube:community"
                tags "DevOnly"
            }

            structurizrLite = container "Structurizr Lite" {
                description "Architecture documentation server. Reads workspace.dsl from the repository and serves the C4 model as an interactive web application. Dev tooling only."
                technology "structurizr/lite"
                tags "DevOnly"
            }
        }

        # ── System-level relationships ────────────────────────────────────────

        admin -> controlRoom "Manages catalog and admin operations"
        viewer -> controlRoom "Browses and searches catalog"
        controlRoom -> google "Validates Google ID tokens for sign-in"

        # ── Person → Container ────────────────────────────────────────────────

        admin -> nginx "HTTPS — ports 2112 (app) and 5150 (API/Swagger)"
        viewer -> nginx "HTTPS — port 2112"

        # ── Container → Container ─────────────────────────────────────────────

        nginx -> frontend "Proxies HTTPS :2112 → HTTP :2112 (with WebSocket passthrough)"
        nginx -> backend "Proxies HTTPS :5150 → HTTP :5150"
        frontend -> backend "REST API over internal Docker network — JWT attached by BFF proxy"
        backend -> database "asyncpg connection pool — parameterised SQL only"
        backend -> google "Validates Google ID tokens via google-auth library"

        # ── Frontend component relationships ──────────────────────────────────

        pages -> authContext "Reads username and role to gate UI and show/hide admin controls"
        pages -> tablePageFramework "All catalog, session, tools, and config pages use this"
        tablePageFramework -> apiClient "Fetches paginated data and submits create/update/delete mutations"
        tablePageFramework -> modalSystem "Opens on row click; invalidates query cache on save or delete"
        modalSystem -> apiClient "Saves and deletes records"
        authContext -> authRoutes "Calls login, loginGoogle, logout, and session check (/api/auth/me)"
        apiClient -> bffProxy "Every fetch('/api/...') call is intercepted here"
        bffProxy -> backend "Forwards request with Authorization: Bearer {token read from httpOnly cookie}"
        authRoutes -> backend "Calls /auth/token, /auth/google, /auth/me"

        # ── Backend component relationships ───────────────────────────────────

        configModule -> appCore "Supplies DB DSN, JWT config, and Google client ID on startup"
        appCore -> dbPool "Initialises connection pool on startup; closes on shutdown"
        appCore -> authRouter "Mounts at /auth"
        appCore -> usersRouter "Mounts at /users"
        appCore -> searchRouter "Mounts at /search"
        appCore -> catalogRouters "Mounts at /brands, /models, /effects, /instruments, /libraries, /workstations"
        appCore -> toolsRouter "Mounts at /tools/{category}"
        appCore -> configRouter "Mounts at /config/{slug}"
        appCore -> adminRouters "Mounts at /admin/change-review, /admin/stats, /admin/backup, /admin/restore, /admin/export, /admin/import"

        catalogRouters -> authRouter "Depends(require_admin) on all write routes"
        toolsRouter -> authRouter "Depends(require_admin) on all write routes"
        configRouter -> authRouter "Depends(require_admin) on all write routes"
        adminRouters -> authRouter "Depends(require_admin) on all routes"
        usersRouter -> authRouter "Depends(get_current_user) and Depends(require_admin) on write routes"
        searchRouter -> authRouter "Depends(get_current_user)"

        catalogRouters -> crudLibrary "list_entities, get_entity, delete_entity, get_history"
        toolsRouter -> crudLibrary "list_entities, get_entity, delete_entity, get_history"
        configRouter -> crudLibrary "list_entities, get_entity, delete_entity, get_history"
        adminRouters -> crudLibrary "log_audit, apply_old_data, fetch_mutable_entry"
        adminRouters -> xlsxLibrary "build_workbook, parse_workbook, validate_import, execute_import"

        authRouter -> dbPool "Reads users table; bcrypt verify on login"
        usersRouter -> dbPool "Reads and writes users table"
        searchRouter -> dbPool "Queries all 11 catalog views"
        catalogRouters -> dbPool "Reads/writes catalog tables and audit_log"
        toolsRouter -> dbPool "Reads/writes tool tables and audit_log"
        configRouter -> dbPool "Reads/writes lookup tables and audit_log"
        adminRouters -> dbPool "Reads/writes audit_log; reads all catalog tables"
        crudLibrary -> dbPool "Executes parameterised SQL for list, get, delete, and audit"

        dbPool -> database "Maintains asyncpg connection pool"
        authRouter -> google "Validates Google ID tokens on /auth/google"
    }

    views {

        # ── Level 1: System Context ───────────────────────────────────────────

        systemContext controlRoom "SystemContext" {
            title "Level 1 — System Context"
            include *
            autoLayout lr
        }

        # ── Level 2: Containers ───────────────────────────────────────────────

        container controlRoom "Containers" {
            title "Level 2 — Container Diagram"
            include *
            autoLayout lr
        }

        # ── Level 3: Backend Components ───────────────────────────────────────

        component backend "BackendComponents" {
            title "Level 3 — FastAPI Backend Components"
            include *
            autoLayout lr
        }

        # ── Level 3: Frontend Components ─────────────────────────────────────

        component frontend "FrontendComponents" {
            title "Level 3 — Next.js Frontend Components"
            include *
            autoLayout lr
        }

        # ── Level 4: BFF Authentication Flow (Dynamic) ───────────────────────
        # Shows how a browser request flows through the stack and how the JWT
        # is attached without ever being exposed to client-side JavaScript.

        dynamic controlRoom "BffJwtFlow" {
            title "Level 4 — BFF Authentication Flow"
            viewer -> nginx "1. HTTPS GET /catalog/brands (browser sends httpOnly cookie automatically)"
            nginx -> frontend "2. HTTP :2112 (proxied)"
            frontend -> backend "3. Proxy reads cookie, attaches Authorization: Bearer {token}, forwards GET /brands"
            backend -> database "4. SELECT * FROM brands_view WHERE ... LIMIT $1 OFFSET $2"
            autoLayout lr
        }

        # ── Level 4: FastAPI Auth Dependency Chain (Dynamic) ─────────────────
        # Shows how require_admin fires before any route handler, so a
        # non-admin user never reaches database logic.

        dynamic backend "AuthDependencyChain" {
            title "Level 4 — FastAPI Auth Dependency Chain"
            appCore -> authRouter "1. Incoming request — resolve require_admin dependency"
            authRouter -> dbPool "2. Decode HS256 JWT, fetch user row from DB"
            dbPool -> database "3. SELECT username, role FROM users WHERE username = $1"
            appCore -> catalogRouters "4. require_admin satisfied — route handler invoked"
            catalogRouters -> crudLibrary "5. list_entities / create / update / delete"
            crudLibrary -> dbPool "6. Parameterised SQL + log_audit INSERT"
            autoLayout lr
        }

        # ── Styles ────────────────────────────────────────────────────────────

        styles {

            element "Person" {
                shape Person
                background #1168bd
                color #ffffff
                fontSize 14
            }

            element "Admin" {
                shape Person
                background #0e3a6e
                color #ffffff
            }

            element "User" {
                shape Person
                background #1168bd
                color #ffffff
            }

            element "Software System" {
                background #1168bd
                color #ffffff
            }

            element "External" {
                background #666666
                color #ffffff
            }

            element "Container" {
                background #438dd5
                color #ffffff
            }

            element "Frontend" {
                background #2d6099
                color #ffffff
            }

            element "Backend" {
                background #1a4f7a
                color #ffffff
            }

            element "Database" {
                shape Cylinder
                background #1a4f7a
                color #ffffff
            }

            element "Infrastructure" {
                background #555555
                color #ffffff
            }

            element "DevOnly" {
                background #999999
                color #ffffff
            }

            element "Component" {
                background #85bbf0
                color #000000
            }

            element "Application" {
                background #1a4f7a
                color #ffffff
            }

            element "InfrastructureComponent" {
                background #555555
                color #ffffff
            }

            element "Router" {
                background #438dd5
                color #ffffff
            }

            element "BFF" {
                background #2d6099
                color #ffffff
            }

            element "Library" {
                background #85bbf0
                color #000000
            }

            element "UI" {
                background #6699bb
                color #ffffff
            }
        }
    }
}
