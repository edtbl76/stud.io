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
            description "Operates the local development environment. Uses the Roadie CLI to start, stop, restart, and check the status of the STUD.io Docker stack. Runs 'roadie build' to rebuild images and apply schema to test databases, 'roadie release' for the full release gate, and 'roadie db init' for first-time production database setup. Uses 'roadie test unit/scan/perf/pbt/e2e/full' to run test and quality suites."
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
                technology "Node 20 / Next.js 16 / TypeScript / React 19"
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
                    description "Typed fetch wrapper with methods for list, listPaged, get, create, update, delete, searchGlobal, and uploadPhoto. All calls target relative /api/... paths — no Authorization header is set by client code. The browser sends the httpOnly cookie automatically. uploadPhoto sends a raw File as the request body with the file's Content-Type, bypassing the default application/json header. listPaged handles endpoints that already contain query params by using & instead of ? as the separator."
                    technology "lib/api.ts"
                    tags "Library"
                }

                tablePageFramework = component "TablePage Framework" {
                    description "Generic CRUD page container used by all 18 data tables. Manages server-side pagination via useInfiniteQuery (paginated) or useQuery (non-paginated) through useTableData. Per-column filtering with 350ms debounce and 2-char minimum. Sorting, bulk edit bar (admin only), and modal dispatch on row click. Session state (filters, sorting, column visibility, column sizing) is persisted to localStorage per user and query key via useSessionState; a Reset View button appears in the DataTableToolbar when state differs from defaults. Record navigation (prev/next) across the visible table row order is provided by useRecordNavigation. Query invalidation on mutation triggers automatic refetch."
                    technology "components/TablePage.tsx + DataTable.tsx + DataTableToolbar.tsx + lib/useSessionState.ts + lib/useTableData.ts"
                    tags "UI"
                }

                modalSystem = component "Modal System" {
                    description "RecordModal shell supporting view, edit, history, and two-stage delete modes. Nine domain-specific modals (BrandModal, ModelModal, EffectModal, InstrumentModal, LibraryModal, WorkstationModal, ToolModal, ConfigModal, GearModal) each compose RecordModal and own their form state. GearModal adds guitar pickup slot UI (conditional on gear type), inline photo upload via api.uploadPhoto (raw File binary, independent of form save), and a maintenance log read-only section. RecordHistoryView renders the full audit trail with field-level diffs and undo. History is optional — modals backed by endpoints without a history route can omit it."
                    technology "components/RecordModal.tsx + components/tables/"
                    tags "UI"
                }

                pages = component "Pages" {
                    description "Multi-module shell with a fixed TopBar (h-12, z-50) rendered by LayoutShell on all non-login pages. TopBar contains the global search form; submitting navigates to /search. All page content is offset by pt-12. Five top-level areas: (1) Home -- module selection tiles at /; (2) Search at /search -- global search results with ControlRoom Sidebar; /controlroom/search redirects here; (3) ControlRoom at /controlroom/ -- catalog, session (effects, instruments, libraries, workstations), tools, config, and admin; (4) Studio Management at /studio/ -- catalog, config (including Gear Types), and admin; (5) GearList at /gearlist/ -- Guitars page and Other Gear page. Each module has its own Next.js layout mounting Sidebar, UsersSidebar, or GearListSidebar (all built on SidebarShell, fixed top-12). ModuleSwitcher in every sidebar provides one-click navigation between all modules."
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

            # ── GearList Backend ─────────────────────────────────────────────

            gearlistBackend = container "GearList Backend" {
                description "Go service managing gear inventory: gear types, individual gear items, maintenance logs, and photo uploads. Exposes a REST API on port 4001. All writes are audited. Receives pre-authenticated requests from FastAPI (X-User / X-Role headers); never handles JWTs directly."
                technology "Go 1.26 / net/http / pgx v5 / minio-go"
                tags "Backend"

                gearTypesRouter = component "Gear Types Handler" {
                    description "CRUD for gear_types lookup table. Paginated list, get, create (admin), update (admin), soft-delete (admin). All writes recorded in audit_log."
                    technology "internal/geartypes/"
                    tags "Router"
                }

                gearRouter = component "Gear Handler" {
                    description "CRUD for the gear table. Paginated list with name and type_id filters, get, create (admin), update (admin), soft-delete (admin), history, photo upload. Reads from gear_view (resolves gear_type_name). Photo upload proxied to MinIO; DB write failure triggers orphan cleanup."
                    technology "internal/gear/"
                    tags "Router"
                }

                maintenanceRouter = component "Maintenance Handler" {
                    description "Append-only maintenance log for gear items. List entries, create entry (admin). No update or delete."
                    technology "internal/maintenance/"
                    tags "Router"
                }

                gearlistConfig = component "Config" {
                    description "Loads APP_PORT, DB_HOST/PORT/USER/PASSWORD/NAME, and MinIO credentials (MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY, MINIO_BUCKET) from environment variables. MinIO is optional — if MINIO_ENDPOINT is empty, photo upload returns 503."
                    technology "internal/config/"
                    tags "InfrastructureComponent"
                }

                photoUploader = component "Photo Uploader" {
                    description "Uploads gear photos to MinIO using minio-go. Validates Content-Type (jpeg/png/webp) and Content-Length (max 10 MB) before the upload. Returns the object key (gear/{id}/photo.{ext}). On DB write failure the caller deletes the object to prevent orphans. Uses a detached context for cleanup so cancellation of the request context does not prevent deletion."
                    technology "internal/gear/photo.go"
                    tags "Library"
                }
            }

            # ── MinIO ─────────────────────────────────────────────────────────

            minio = container "MinIO" {
                description "S3-compatible object store for gear photos. Bucket: studio-photos. API on port 1983, admin console on port 1982. Accessible only within the Docker bridge network — the Go service uploads directly; clients retrieve photos via the FastAPI BFF proxy."
                technology "MinIO (latest)"
                tags "Infrastructure"
            }

            # ── Database ─────────────────────────────────────────────────────

            database = container "PostgreSQL" {
                description "Primary data store. Three logical databases: masterdb (production app), masterdb_test (automated test suite — each test runs in a rolled-back transaction), studio (legacy CSV pipeline). pgvector extension installed for future vector similarity. Semantic views (brands_view, models_view, etc.) used for reads; base tables for writes. audit_log table records every CREATE, UPDATE, and DELETE with old_data/new_data JSON snapshots."
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
            description "Go CLI binary that manages the STUD.io local development stack. Provides start, stop, restart, and status commands (Phase 2), a pipeline engine for tool invocation (Phase 3), and build, release, and db init commands (Phase 4). Absorbs build.sh and roadie.sh; will absorb test-*.sh and remaining scripts/run-*.sh wrappers in Phase 5."

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

            # ── Build Commands ────────────────────────────────────────────────

            buildCommands = container "Build Commands" {
                description "Registers 'build' and 'release' cobra subcommands. build() rebuilds container images via Manager.Build, applies schema files to all configured test databases via schemaApplier, then runs the requested test suites through the pipeline engine. release is shorthand for build --dev --full."
                technology "Go / Cobra — internal/commands/build.go"
                tags "CLIContainer"

                buildCmd = component "build" {
                    description "Rebuilds images with --build --force-recreate, applies schema to each test database in build.databases, then runs unit tests (tsc → jest → pytest) and any enabled suites (--e2e, --scan, --perf). --full enables all three. --skip-tests suppresses the unit suite only. --dev includes the SonarQube/Structurizr dev overlay."
                    technology "cobra.Command"
                    tags "CLIComponent"
                }

                releaseCmd = component "release" {
                    description "Full release gate equivalent to 'build --dev --full'. No optional flags — all suites run unconditionally."
                    technology "cobra.Command"
                    tags "CLIComponent"
                }

                schemaApplierComp = component "schemaApplier" {
                    description "Holds db provider, schema file list, and service/user from config. Calls PostgresProvider.ExecSQLFile for each (schema file, test database) pair in order. The production database never appears in the configured database list — use 'roadie db init' for first-time production setup."
                    technology "Go — schemaApplier struct in build.go"
                    tags "CLIComponent"
                }
            }

            # ── DB Commands ───────────────────────────────────────────────────

            dbCommands = container "DB Commands" {
                description "Registers the 'db init [--yes]' cobra subcommand. Applies schema files to the production database for first-time setup. Validates that providers.database.db_name and build.schema_files are set. Includes an interactive confirmation gate; --yes bypasses it for scripted use."
                technology "Go / Cobra — internal/commands/db.go"
                tags "CLIContainer"

                dbInitCmd = component "db init" {
                    description "Prints a boxed WARNING banner and requires the user to type 'yes' to confirm (unless --yes is set). Validates config, then calls PostgresProvider.ExecSQLFile for each schema file against the production database. Intended for first-time setup only — not idempotent."
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

            # ── Pipeline Engine ───────────────────────────────────────────────

            pipelineEngine = container "Pipeline Engine" {
                description "Execution layer for all tool invocations. Replaces scripts/run-*.sh with type-safe, testable Go equivalents. Two execution modes: fatal-sequential (stop on first failure) and collect (run all, accumulate StepResults). All output is line-prefixed via LabelWriter. PATH to Node and Python is resolved at step-creation time from NVM and conda directories."
                technology "Go — internal/pipeline/"
                tags "CLIContainer"

                labelWriter = component "LabelWriter" {
                    description "io.Writer decorator that buffers incoming bytes and prefixes each completed line with '[stepname] '. Replicates sed -u 's/^/[label] /' from the shell scripts. Partial lines are held in an internal byte buffer until a newline arrives."
                    technology "Go — pipeline.go"
                    tags "CLIComponent"
                }

                toolStepPipeline = component "ToolStep + Pipeline" {
                    description "ToolStep is a value type holding Bin, Args, Dir, and Env for a single tool invocation. Pipeline sequences ToolSteps in two modes: RunSequential (fatal — stop on first failure, used by test unit) and RunCollect (non-fatal — run all, return []StepResult, used by test scan and test perf). StepResult captures name, error, and duration per step — the building block for Phase 6 --json output."
                    technology "Go — pipeline.go"
                    tags "CLIComponent"
                }

                pathResolvers = component "PATH Resolvers" {
                    description "ResolveNode scans ~/.nvm/versions/node/<latest>/bin then /usr/local/bin and /usr/bin. ResolvePython scans ~/anaconda3/bin, ~/miniconda3/bin, ~/opt/anaconda3/bin, ~/opt/miniconda3/bin. The resolved directory is injected as PATH=<dir>:$PATH in the step Env field. Returns empty string if no managed runtime is found, in which case the step inherits the shell PATH."
                    technology "Go — resolve.go"
                    tags "CLIComponent"
                }

                stepFactories = component "Step Factories" {
                    description "Factory functions that return pre-configured ToolSteps mirroring each run-*.sh script: TscStep (tsc --noEmit), JestStep (jest --passWithNoTests; coverage flag for SonarQube), PytestStep (python -m pytest), BanditStep (python -m bandit), PipAuditStep (python -m pip_audit, ignores CVE-2024-23342), NpmAuditStep (npm audit --audit-level=critical), TrivyStep (docker run trivy image). All accept a Root named type (not raw string) for the repo root; TrivyStep also takes ImageRef for the image reference — both types prevent primitive-obsession errors at call sites."
                    technology "Go — steps.go"
                    tags "CLIComponent"
                }
            }
        }

        # ── System-level relationships ────────────────────────────────────────

        admin -> controlRoom "Manages catalog and admin operations"
        viewer -> controlRoom "Browses and searches catalog"
        controlRoom -> google "Validates Google ID tokens for sign-in"
        developer -> roadie "Runs CLI commands: start, stop, restart, status, build, release, db init"
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
        backend -> gearlistBackend "HTTP proxy — strips JWT, injects X-User / X-Role headers"
        gearlistBackend -> database "pgx connection pool — parameterised SQL only"
        gearlistBackend -> minio "minio-go client — PutObject / RemoveObject for gear photos"

        # ── Roadie → ControlRoom containers ──────────────────────────────────

        dockerProvider -> dockerDaemon "docker compose up / down / ps / exec"
        postgresProvider -> dockerDaemon "docker compose exec pg_isready / psql"
        httpChecker -> nginx "GET https://localhost:2112 and https://localhost:5150/health"

        # ── Roadie container relationships ────────────────────────────────────

        roadieCLI -> stackCommands "Registers subcommands and delegates invocations"
        roadieCLI -> buildCommands "Registers subcommands and delegates invocations"
        roadieCLI -> dbCommands "Registers subcommands and delegates invocations"
        stackCommands -> configLoader "Load(\".\") — reads and validates roadie.yml"
        stackCommands -> stackManager "Constructs Manager with providers; calls Start / Stop / Status"
        buildCommands -> configLoader "Load(\".\") — reads and validates roadie.yml"
        buildCommands -> stackManager "Manager.Build(ctx, cfg, --dev) — compose up --build --force-recreate"
        buildCommands -> postgresProvider "schemaApplier.applyToDatabase — ExecSQLFile per (schema, test database)"
        buildCommands -> pipelineEngine "TscStep → JestStep → PytestStep; optional E2EStep, ScanStep, PerfStep"
        dbCommands -> configLoader "Load(\".\") — reads and validates roadie.yml"
        dbCommands -> postgresProvider "ExecSQLFile per schema file → production database"
        stackManager -> dockerProvider "ContainerProvider: Up, Down, Status, IsRunning, Exec"
        stackManager -> postgresProvider "SQLDatabaseProvider: IsReady (retry loop)"
        stackManager -> httpChecker "HTTPHealthChecker: IsReachable (retry loop)"

        # ── Stack Commands component relationships ────────────────────────────

        startCmd -> stackManager "Manager.Start(ctx, cfg, withDev)"
        stopCmd -> stackManager "Manager.Stop(ctx, cfg, withDev)"
        restartCmd -> stackManager "Manager.Stop then Manager.Start"
        statusCmd -> stackManager "Manager.Status(ctx, cfg)"

        # ── Build Commands component relationships ────────────────────────────

        buildCmd -> schemaApplierComp "Constructs schemaApplier from config; applyToDatabase for each test DB"
        releaseCmd -> schemaApplierComp "Same path as buildCmd — --dev --full, all suites"
        schemaApplierComp -> postgresProvider "ExecSQLFile(ctx, dbCfg, schemaFile)"
        dbInitCmd -> postgresProvider "ExecSQLFile(ctx, prodDbCfg, schemaFile)"

        # ── Pipeline Engine relationships ─────────────────────────────────────

        stepFactories -> pathResolvers "Calls ResolveNode / ResolvePython at step-creation time"
        stepFactories -> labelWriter "Each ToolStep.Run wraps out with NewLabelWriter(step.Name)"
        toolStepPipeline -> labelWriter "ToolStep.Run routes all output through LabelWriter"
        pipelineEngine -> dockerDaemon "TrivyStep: docker run ghcr.io/aquasecurity/trivy:latest image ..."

        # ── GearList Backend component relationships ──────────────────────────

        gearlistConfig -> gearRouter "Supplies DSN and MinIO credentials at startup"
        gearlistConfig -> gearTypesRouter "Supplies DSN at startup"
        gearRouter -> photoUploader "Delegates photo upload and cleanup"
        photoUploader -> minio "PutObject / RemoveObject"
        gearRouter -> database "pgx — reads gear_view, writes gear base table + audit_log"
        gearTypesRouter -> database "pgx — reads/writes gear_types + audit_log"
        maintenanceRouter -> database "pgx — reads/writes gear_maintenance_log"

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

        # ── Level 3: Roadie Build Commands Components ─────────────────────────

        component buildCommands "RoadieBuildCommandsComponents" {
            title "Level 3 — Roadie Build Commands Components"
            include *
            autoLayout lr
        }

        # ── Level 3: Roadie DB Commands Components ────────────────────────────

        component dbCommands "RoadieDBCommandsComponents" {
            title "Level 3 — Roadie DB Commands Components"
            include *
            autoLayout lr
        }

        # ── Level 3: Roadie Pipeline Engine Components ────────────────────────

        component pipelineEngine "RoadiePipelineComponents" {
            title "Level 3 — Roadie Pipeline Engine Components"
            include *
            autoLayout lr
        }

        # ── Level 4: BFF Authentication Flow (Dynamic) ───────────────────────
        # Shows how a browser request flows through the stack and how the JWT
        # is attached without ever being exposed to client-side JavaScript.

        dynamic controlRoom "BffJwtFlow" {
            title "Level 4 — BFF Authentication Flow"
            viewer -> nginx "1. HTTPS GET /controlroom/catalog/brands (browser sends httpOnly cookie automatically)"
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
            dockerProvider -> dockerDaemon "6. docker compose up -d --remove-orphans"
            stackManager -> postgresProvider "7. Poll IsReady every 2s (up to 5 min)"
            postgresProvider -> dockerDaemon "8. docker compose exec -T <service> pg_isready -U studio -q"
            stackManager -> httpChecker "9. Poll IsReachable every 2s — API health check"
            httpChecker -> nginx "10. GET https://localhost:5150/health — await 2xx"
            stackManager -> httpChecker "11. Poll IsReachable every 2s — Frontend health check"
            httpChecker -> nginx "12. GET https://localhost:2112 — await 2xx"
            autoLayout lr
        }

        # ── Level 4: roadie build Command Flow (Dynamic) ─────────────────────
        # Shows the sequence from CLI invocation through image rebuild, schema
        # application to test databases, and unit test execution.

        dynamic roadie "RoadieBuildFlow" {
            title "Level 4 — roadie build Command Flow"
            developer -> roadieCLI "1. roadie build [--dev] [--skip-tests] [flags]"
            roadieCLI -> buildCommands "2. Cobra dispatches to build subcommand"
            buildCommands -> configLoader "3. Load and validate roadie.yml"
            buildCommands -> stackManager "4. Manager.Build(ctx, cfg, --dev) — rebuild images"
            stackManager -> dockerProvider "5. ContainerProvider.Up — --build --force-recreate"
            dockerProvider -> dockerDaemon "6. docker compose up --build --force-recreate"
            buildCommands -> postgresProvider "7. schemaApplier: apply schema_files to each test database"
            postgresProvider -> dockerDaemon "8. docker compose exec psql — pipe SQL via stdin (-f -)"
            buildCommands -> pipelineEngine "9. Pipeline.RunSequential: TscStep → JestStep → PytestStep"
            pipelineEngine -> labelWriter "10. Each step output prefixed with [stepname]"
            autoLayout lr
        }

        # ── Level 4: Pipeline Collect Execution Flow (Dynamic) ───────────────
        # Shows how a collect-mode pipeline (e.g. roadie test scan) runs all
        # steps regardless of failure and produces a PASS/FAIL summary table.

        dynamic roadie "RoadiePipelineCollectFlow" {
            title "Level 4 — Pipeline Collect Execution Flow"
            developer -> roadieCLI "1. roadie test scan (Phase 5)"
            roadieCLI -> pipelineEngine "2. pipeline.New(BanditStep, PipAuditStep, NpmAuditStep, TrivyStep(root, imageRef))"
            pipelineEngine -> pathResolvers "3. ResolveNode / ResolvePython at step-creation time"
            pipelineEngine -> toolStepPipeline "4. Pipeline.RunCollect(ctx, out)"
            toolStepPipeline -> labelWriter "5. Each step wraps out with NewLabelWriter(step.Name)"
            toolStepPipeline -> dockerDaemon "6. TrivyStep: docker run trivy image <imageRef>"
            toolStepPipeline -> pipelineEngine "7. Return []StepResult (name, err, duration per step)"
            pipelineEngine -> roadieCLI "8. PrintSummary — PASS/FAIL table; non-zero exit if any failed"
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
