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

        developer = person "Developer" {
            description "Operates the local development environment. Uses the Roadie CLI to start, stop, restart, and check the status of the STUD.io Docker stack. Will also use Roadie for build, test, scan, and performance commands as those phases are implemented."
            tags "Developer"
        }

        # ── External Systems ──────────────────────────────────────────────────

        google = softwareSystem "Google OAuth 2.0" {
            description "Provides user identity for Google Sign-In. The backend validates ID tokens via the google-auth library; the frontend displays the sign-in button via the Google Identity Services SDK."
            tags "External"
        }

        dockerDaemon = softwareSystem "Docker Daemon" {
            description "Local Docker engine. Receives docker compose commands from Roadie to bring services up and down, query service status, and exec into containers for health checks."
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

        # ── Roadie CLI ────────────────────────────────────────────────────────

        roadie = softwareSystem "Roadie CLI" {
            description "Go CLI binary that manages the STUD.io local development stack. Provides start, stop, restart, and status commands with full health-check polling. Will absorb build, test, scan, and performance commands in later phases, retiring roadie.sh, build.sh, and all scripts/run-*.sh wrappers."

            # ── CLI Entry Point ───────────────────────────────────────────────

            roadieCLI = container "CLI Entry Point" {
                description "Cobra root command. Registers --verbose persistent flag and delegates to subcommand groups. Version string injected at build time via -ldflags '-X main.version=x.y.z'."
                technology "Go 1.26 / Cobra — cmd/roadie/main.go"
                tags "CLIContainer"
            }

            # ── Stack Commands ────────────────────────────────────────────────

            stackCommands = container "Stack Commands" {
                description "Registers start [--dev], stop [--dev], restart [--dev], and status cobra subcommands. Each loads roadie.yml, constructs a Manager with the three providers, and calls the appropriate Manager method."
                technology "Go / Cobra — internal/commands/stack.go"
                tags "CLIContainer"

                startCmd = component "start" {
                    description "Calls Manager.Start(ctx, cfg, --dev). Blocks until all health checks in roadie.yml pass, then prints service URLs."
                    technology "cobra.Command"
                    tags "CLIComponent"
                }

                stopCmd = component "stop" {
                    description "Calls Manager.Stop(ctx, cfg, --dev). Tears down the Docker Compose stack."
                    technology "cobra.Command"
                    tags "CLIComponent"
                }

                restartCmd = component "restart" {
                    description "Calls Manager.Stop then Manager.Start in sequence. Accepts --dev."
                    technology "cobra.Command"
                    tags "CLIComponent"
                }

                statusCmd = component "status" {
                    description "Calls Manager.Status, which streams docker compose ps output to stdout."
                    technology "cobra.Command"
                    tags "CLIComponent"
                }
            }

            # ── Stack Manager ─────────────────────────────────────────────────

            stackManager = container "Stack Manager" {
                description "Orchestrates the full start/stop/status lifecycle. On start: calls ContainerProvider.Up, then iterates health checks from config polling every 2 seconds up to a 5-minute timeout, then prints service URLs. On stop: calls ContainerProvider.Down."
                technology "Go — internal/stack/manager.go"
                tags "CLIContainer"
            }

            # ── Config Loader ─────────────────────────────────────────────────

            configLoader = container "Config Loader" {
                description "Reads and validates roadie.yml from the repo root. Validates required provider fields and all health check entries (type, URL for http, user for database). Exposes typed Config, ProvidersConfig, StackConfig, HealthCheck, and URLsConfig structs."
                technology "Go / gopkg.in/yaml.v3 — internal/config/"
                tags "CLIContainer"
            }

            # ── Providers ─────────────────────────────────────────────────────

            dockerProvider = container "Docker Provider" {
                description "Implements ContainerProvider. Up runs 'docker compose -f <file> up -d --remove-orphans'. Down runs 'docker compose down'. Status streams 'docker compose ps'. Supports merging a dev compose overlay via a second -f flag when --dev is set."
                technology "Go — internal/providers/docker.go"
                tags "CLIContainer"
            }

            postgresProvider = container "Postgres Provider" {
                description "Implements SQLDatabaseProvider. IsReady runs 'docker compose exec -T <service> pg_isready -U <user> -q' to test availability without a direct network connection. ExecSQL runs psql inside the container."
                technology "Go — internal/providers/postgres.go"
                tags "CLIContainer"
            }

            httpChecker = container "HTTP Checker" {
                description "Implements HTTPHealthChecker. Issues an HTTP GET with TLS verification disabled (local self-signed mkcert certs). Returns true on any 2xx response; returns false without error on connection refused so the retry loop can continue."
                technology "Go / net/http — internal/providers/http_checker.go"
                tags "CLIContainer"
            }
        }

        # ── System-level relationships ────────────────────────────────────────

        admin -> controlRoom "Manages catalog and admin operations"
        viewer -> controlRoom "Browses and searches catalog"
        controlRoom -> google "Validates Google ID tokens for sign-in"
        developer -> roadie "Runs CLI commands: start, stop, restart, status"
        roadie -> controlRoom "Manages — starts, stops, restarts, and health-checks"
        roadie -> dockerDaemon "Invokes docker compose up / down / ps / exec"

        # ── Person → Container ────────────────────────────────────────────────

        admin -> nginx "HTTPS — ports 2112 (app) and 5150 (API/Swagger)"
        viewer -> nginx "HTTPS — port 2112"

        # ── Container → Container ─────────────────────────────────────────────

        nginx -> frontend "Proxies HTTPS :2112 → HTTP :2112 (with WebSocket passthrough)"
        nginx -> backend "Proxies HTTPS :5150 → HTTP :5150"
        frontend -> backend "REST API over internal Docker network — JWT attached by BFF proxy"
        backend -> database "asyncpg connection pool — parameterised SQL only"
        backend -> google "Validates Google ID tokens via google-auth library"

        # ── Roadie → ControlRoom containers ──────────────────────────────────

        dockerProvider -> dockerDaemon "docker compose up / down / ps / exec"
        postgresProvider -> dockerDaemon "docker compose exec pg_isready / psql"
        httpChecker -> nginx "GET https://localhost:2112 and https://localhost:5150/health"

        # ── Roadie container relationships ────────────────────────────────────

        roadieCLI -> stackCommands "Registers subcommands and delegates invocations"
        stackCommands -> configLoader "Load(\".\") — reads and validates roadie.yml"
        stackCommands -> stackManager "Constructs Manager with providers; calls Start / Stop / Status"
        stackManager -> dockerProvider "ContainerProvider: Up, Down, Status, IsRunning, Exec"
        stackManager -> postgresProvider "SQLDatabaseProvider: IsReady (retry loop)"
        stackManager -> httpChecker "HTTPHealthChecker: IsReachable (retry loop)"

        # ── Stack Commands component relationships ────────────────────────────

        startCmd -> stackManager "Manager.Start(ctx, cfg, withDev)"
        stopCmd -> stackManager "Manager.Stop(ctx, cfg, withDev)"
        restartCmd -> stackManager "Manager.Stop then Manager.Start"
        statusCmd -> stackManager "Manager.Status(ctx, cfg)"

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

        systemContext roadie "RoadieSystemContext" {
            title "Level 1 — Roadie System Context"
            include *
            autoLayout lr
        }

        # ── Level 2: Containers ───────────────────────────────────────────────

        container controlRoom "Containers" {
            title "Level 2 — Container Diagram"
            include *
            autoLayout lr
        }

        container roadie "RoadieContainers" {
            title "Level 2 — Roadie Container Diagram"
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

        # ── Level 3: Roadie Stack Commands Components ─────────────────────────

        component stackCommands "RoadieStackCommandsComponents" {
            title "Level 3 — Roadie Stack Commands Components"
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

        # ── Level 4: Roadie Start Flow (Dynamic) ─────────────────────────────
        # Shows the full sequence from CLI invocation through docker compose up,
        # health-check polling, and URL output.

        dynamic roadie "RoadieStartFlow" {
            title "Level 4 — roadie start Command Flow"
            developer -> roadieCLI "1. roadie start [--dev]"
            roadieCLI -> stackCommands "2. Cobra dispatches to start subcommand"
            stackCommands -> configLoader "3. Load and validate roadie.yml"
            stackCommands -> stackManager "4. NewManager(dockerProvider, postgresProvider, httpChecker)"
            stackManager -> dockerProvider "5. ContainerProvider.Up — compose file + optional dev overlay"
            dockerProvider -> dockerDaemon "6. docker compose up -d --no-recreate"
            stackManager -> postgresProvider "7. Poll IsReady every 2s (up to 5 min)"
            postgresProvider -> dockerDaemon "8. docker compose exec -T <service> pg_isready -U studio -q"
            stackManager -> httpChecker "9. Poll IsReachable every 2s — API health check"
            httpChecker -> nginx "10. GET https://localhost:5150/health — await 2xx"
            stackManager -> httpChecker "11. Poll IsReachable every 2s — Frontend health check"
            httpChecker -> nginx "12. GET https://localhost:2112 — await 2xx"
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

            element "Developer" {
                shape Person
                background #2e7d32
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

            element "CLIContainer" {
                background #388e3c
                color #ffffff
            }

            element "CLIComponent" {
                background #a5d6a7
                color #000000
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
