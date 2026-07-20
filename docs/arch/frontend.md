# Frontend

## Overview

The frontend is a [Next.js](https://nextjs.org/) 16 app (App Router) written in TypeScript with React 19, styled with [Tailwind CSS](https://tailwindcss.com/) and [shadcn/ui](https://ui.shadcn.com/) primitives. It runs as a dev server inside Docker for development and E2E testing; a production build is used for the Lighthouse performance suite.

- App URL: `https://localhost:2112`
- All API calls are relative `/api/...` paths — the Next.js server proxies them to FastAPI internally

The app is a **Backend for Frontend (BFF)**. There is no browser-visible backend URL. The browser talks only to the Next.js server; Next.js holds the JWT in an httpOnly cookie and attaches it to every request it forwards to FastAPI. This architecture eliminates CORS issues, hides the backend URL from clients, and makes the app fully accessible from any machine on the network without configuration changes.

---

## Directory structure

```
app/studio_frontend/
├── app/                    # Next.js App Router pages and API routes
│   ├── api/                # BFF API routes (server-side)
│   │   ├── auth/
│   │   │   ├── token/      # POST — username/password login
│   │   │   ├── google/     # POST — Google SSO login
│   │   │   ├── logout/     # POST — cookie deletion
│   │   │   └── session.ts  # Shared helper: calls FastAPI /auth/me, sets httpOnly cookie
│   │   ├── scanner/        # Scanner BFF routes (NOT the catch-all proxy — special handling)
│   │   │   ├── scan/       # POST — API key passthrough to FastAPI /scanner/scan
│   │   │   └── download/
│   │   │       ├── _s3.ts      # S3Client singleton + listReleases/getObject helpers
│   │   │       ├── latest/     # GET — latest release metadata from studio-downloads bucket
│   │   │       ├── history/    # GET — all releases, newest-first
│   │   │       └── url/        # GET ?key= — streams release zip from MinIO
│   │   └── [...path]/      # Catch-all proxy — reads httpOnly cookie, adds Bearer, forwards to FastAPI
│   ├── login/              # Login page
│   ├── page.tsx            # Home page — module selection tiles + StudioIllustration
│   ├── search/             # Global search results page (/search?q=...)
│   │   ├── layout.tsx      # Renders Sidebar + main content area
│   │   └── page.tsx        # SearchContent: query, tabs, notes toggle, modal dispatch
│   ├── controlroom/        # ControlRoom module
│   │   ├── layout.tsx      # Renders Sidebar + main content area
│   │   ├── session/        # Effects, Instruments, Libraries, Workstations
│   │   ├── tools/          # Admin, Composition, Measurement, Reference, Workflow tools
│   │   └── scanner/        # Plugin Scanner — bucket triage pages + rules management
│   │       ├── report/     # Scan Report — raw scan results grouped by status (U-05a, 1.17.0)
│   │       ├── workbench/  # Scan Workbench — five-bucket unified triage UI (U-04, 1.17.0)
│   │       ├── known/      # Known (matched + catalog has disk_paths)
│   │       ├── matched/    # Matched, awaiting acknowledgement
│   │       ├── conflicted/ # Version mismatch between disk and catalog
│   │       ├── unconfirmed/# Fuzzy match awaiting review
│   │       ├── untracked/  # No catalog match found
│   │       ├── orphaned/   # Confirmed links whose catalog record missing from scan
│   │       ├── absent/     # Catalog records with disk_paths not found in this scan
│   │       ├── exclusions/ # Explicitly excluded plugins
│   │       └── rules/      # Plugin Scanner Rules — vendor/name/pattern rule management (U-03, 1.17.0)
│   ├── studio/             # Studio Management module
│   │   ├── layout.tsx      # Renders UsersSidebar + main content area
│   │   ├── catalog/        # Brands, Models
│   │   ├── config/         # Lookup table editors
│   │   │   ├── [slug]/     # effect-types, entity-types, instrument-types,
│   │   │   │               #   model-types, plugin-formats, tag-types, tool-types
│   │   │   └── gear-types/ # Gear types (GearList service — not FastAPI config)
│   │   └── admin/          # Studio Management admin pages
│   │       ├── stats/
│   │       ├── change-review/
│   │       ├── import-export/
│   │       ├── backup/
│   │       ├── plugin-scanner/ # API key management + scanner release downloads
│   │       └── users/
│   └── gearlist/           # GearList module (Go service backend)
│       ├── layout.tsx      # Renders GearListSidebar + main content area
│       ├── guitars/        # Guitars page (pre-filtered to Guitar gear type)
│       └── other-gear/     # Other Gear page (all gear, type-filterable column)
├── components/
│   ├── DataTable.tsx        # Virtualized TanStack Table wrapper; accepts controlled visibility/sizing from useSessionState
│   ├── DataTableToolbar.tsx # Toolbar: sort pills, column picker (ColumnMenu), filter clear, Reset View button
│   ├── TablePage.tsx        # Generic page: search + table + modal
│   ├── RecordModal.tsx      # Generic modal shell: view/edit/history/delete lifecycle
│   ├── RecordHistoryView.tsx # Audit history view: operation badges, diff table, undo
│   ├── FieldRow.tsx         # Label + value display row (handles empty states)
│   ├── TypeBadges.tsx       # Renders [{id, name}] arrays as badge pills
│   ├── ModelLinks.tsx       # Renders ModelRef[] as clickable chips; click fetches and opens ModelModal inline
│   ├── ParentLinks.tsx      # Renders parent_ref arrays
│   ├── StudioIllustration.tsx # SVG music studio scene rendered on the home page
│   ├── layout/             # TopBar, LayoutShell, SidebarShell, Sidebar, UsersSidebar, GearListSidebar, ModuleSwitcher
│   ├── tables/             # Per-table modal and column definitions
│   │   ├── brands/         # BrandModal, columns
│   │   ├── models/         # ModelModal, columns
│   │   ├── effects/        # EffectModal, columns
│   │   ├── instruments/    # InstrumentModal, columns
│   │   ├── libraries/      # LibraryModal, columns
│   │   ├── workstations/   # WorkstationModal, columns
│   │   ├── tools/          # ToolModal, columns (shared by all 5 tool tables)
│   │   ├── config/         # ConfigModal, columns (shared by all config lookup tables)
│   │   ├── gear/           # GearModal, columns, guitarColumns
│   │   ├── scanner/report/    # ScanReportPage, ReportRow — raw scan results accordion with scan picker
│   │   ├── scanner/rules/     # PluginScannerRulesPage, VendorMappingsSection, NameMappingsSection, NamePatternsSection, RuleSection, RuleCreationForm
│   │   ├── scanner/workbench/ # ScanWorkbenchPage, WorkbenchTable, WorkbenchRow, WorkbenchFilterBar, WorkbenchBulkBar, BulkConfirmDialog, BucketTag. Row click routes by bucket (U-15/U-16): needs_review→single-resolution (editable), known→single-resolution (read-only inspect), collision→collision, unlinked & orphaned→find-link, excluded→no-op. Header select-all checkbox toggles select/clear over the filtered visible rows. Bulk Exclude/Reject/Bulk Update are gated by BulkConfirmDialog (U-20): a shared-Dialog confirm showing an affected-of-selected count + skip reason; Reject/Exclude are destructive (Cancel-default focus), Update neutral; Bulk Resolve stays exempt (guided per-item queue). Matched rows (needs_review/collision) render inline `disk → catalog` field diffs via `FieldDiff`; known rows show none; orphaned rows render inline in the main list with the Orphaned tag + empty disk cells (U-16 retired the separate OrphanedSection). Row height stays fixed (react-virtual estimateSize 60).
│   │   ├── scanner/modals/    # SingleResolutionModal (accepts a `readOnly` prop — U-15: read-only "Match Details" inspect view for Known rows, hides radios/Save/Set-Name-Alias; reachable via row click or the bulk-resolve queue), FindLinkModal, CreateRecordModal, HardResetDialog, CollisionModal — all via shared Dialog through ScannerModalContent (enforces ESC/X close, backdrop blocked; U-17). CollisionModal (U-18) is record-centric: driven by the backend `collision` bucket + each row's `collision` sub-state; actions keep-all (acknowledge each copy) / remove-straggler (acknowledge keeper, dismiss rest) / exclude; opened by a per-row Resolve trigger. Client-side collision derivation was removed; collision is now an authoritative backend bucket.
│   │   ├── scanner/KnownPage.tsx      # KnownPage — known bucket list, sorted by catalog type then name, catalog links via catalogRecordPath (U-05b)
│   │   └── scanner/ExclusionsPage.tsx # ExclusionsPage — exclusion list with remove confirmation dialog; shows excluded_by + format (U-05b)
│   ├── admin/              # Shared admin components
│   │   └── ChangeReviewBulkBar.tsx  # Bulk approve/reject bar + confirmation dialog for Change Review page
│   ├── scanner/            # Cross-cutting scanner utilities
│   │   └── RuleToastManager.tsx  # fireRuleToasts — sonner toasts after rule creation (success + affected-count info)
│   └── ui/                 # shadcn/ui primitives (Button, Input, Dialog, etc.)
├── lib/
│   ├── api.ts                   # Typed fetch wrapper — calls relative /api/... paths; uploadPhoto sends raw File binary
│   ├── auth.tsx                 # AuthContext, useAuth hook, session management
│   ├── bulkEdit.ts              # BulkEditField interface — type union: multiselect, singleselect, text, parentsearch
│   ├── bulkConfirmation.ts      # Scan Workbench bulk-confirm view-model (U-20): buildRequest + summaryLine — affected-of-selected count, skip reason, destructive flag for BulkConfirmDialog
│   ├── columnMeta.ts            # TypeScript module augmentation — adds filterParam and defaultHidden to TanStack ColumnMeta
│   ├── catalogNavigation.ts         # CATALOG_ROUTES registry + catalogRecordPath(table, id) — shared navigation utility for catalog record links (U-05b)
│   ├── searchMeta.ts            # SEARCH_TABLE_META registry — maps entity keys to display labels, frontend paths, and API endpoints; derives path from CATALOG_ROUTES
│   ├── computeDiff.ts           # Field-level diff between two JSON snapshots (for history view)
│   ├── parentSelectRecents.ts   # localStorage utility for recent ParentSelect picks — max 10, deduplicated by (table_name, id)
│   ├── types.ts                 # TypeScript interfaces for all API response shapes
│   ├── useSessionState.ts       # Hook: per-user, per-table localStorage persistence for filters, sorting, column visibility, and column sizing. Exposes isDirty and resetView.
│   ├── useRules.ts              # Hook: React Query mutations for scanner rule CRUD (vendor, name, pattern) via TanStack useMutation
│   ├── useWorkbench.ts          # Hook: workbench data, client filters, sub-state derivation, selection (toggle/shift/toggleSelectAll) for ScanWorkbenchPage
│   ├── useFindLink.ts           # Hook: debounced candidate search + selection for FindLinkModal (unlinked-to-orphaned and orphaned-to-unlinked modes)
│   ├── useChangeReviewBulk.ts   # Hook: checkbox selection state + shift-click + select-all for Change Review bulk actions
│   ├── useTableData.ts          # Hook: data fetching for TablePage — handles paginated (useInfiniteQuery) and non-paginated (useQuery) modes, resolves filter params
│   ├── useTableFilters.ts       # Hook: per-column filter state with 350 ms debounce and 2-char minimum (used standalone; session state supersedes this for TablePage)
│   └── utils.ts                 # Tailwind class merge utility (cn), formatSlug, formatDate
├── __tests__/              # Jest + React Testing Library unit tests
└── e2e/                    # Playwright end-to-end tests (run against test stack on port 3001)
```

---

## App shell

STUD.io uses a multi-module shell. The root layout (`app/layout.tsx`) renders `LayoutShell`, which passes `/login` through unstyled and wraps all other routes with the fixed `TopBar` and a `pt-12` content offset. `TopBar` (h-12, z-50, fixed) renders on every non-login page and contains the global search form — submitting navigates to `/search?q=...`.

Each module has its own Next.js layout file that mounts the appropriate sidebar:

| Module | Route prefix | Layout | Sidebar |
|---|---|---|---|
| Home | `/` | `app/layout.tsx` | none |
| Search | `/search/` | `app/search/layout.tsx` | `Sidebar` |
| ControlRoom | `/controlroom/` | `app/controlroom/layout.tsx` | `Sidebar` |
| Studio Management | `/studio/` | `app/studio/layout.tsx` | `UsersSidebar` |
| GearList | `/gearlist/` | `app/gearlist/layout.tsx` | `GearListSidebar` |

All sidebars (`Sidebar`, `UsersSidebar`, `GearListSidebar`) are built on `SidebarShell`, which owns the `<aside>` wrapper (fixed, `top-12`, `h-[calc(100vh-3rem)]` to sit below the TopBar), the STUD.io header (links back to home), the username/sign-out row, and the `ModuleSwitcher` footer. Each sidebar passes its `subtitle` prop and module-specific nav as children.

`ModuleSwitcher` reads the current pathname via `usePathname` and renders links to all modules except the one the user is currently in. There are always one-click links to Home, ControlRoom, Studio Management, and GearList from any page.

---

## Key components

### `TablePage<T>`

The generic page component used by every catalog/session/tools/config page. Accepts:
- `title`, `endpoint`, `queryKey` — page identity
- `columns` — TanStack Table column definitions with optional `meta.filterParam` for server-side filtering and `meta.defaultHidden` to hide a column by default while keeping it available in the column picker
- `getRowId` — extracts the primary key from a row
- `renderModal` — callback that renders the appropriate modal for the table
- `paginated` — enables server-side pagination, sorting, and per-column filtering (all content tables use this)
- `bulkEditFields` — enables the checkbox column and bulk edit bar (admin only). Each entry is a `BulkEditField` (`lib/bulkEdit.ts`) with a `type` of `multiselect`, `singleselect`, `text`, or `parentsearch`. The `parentsearch` type renders a `ParentSelect` pre-populated with the union of existing parents across all selected rows; apply logic merges additions and removes explicit deletions per-record.

Handles: data fetching via `useTableData` (which delegates to `useInfiniteQuery` for paginated tables or `useQuery` for non-paginated), per-column filtering with 350 ms debounce and 2-char minimum, row click → modal open, modal close + query invalidation on mutation.

Session state (filters, sorting, column visibility, column sizing) is managed by `useSessionState` and persisted to `localStorage` under the key `cr:<username>:<queryKey>`. State is restored on page reload. A **Reset View** button appears in the toolbar whenever any state differs from the page defaults (`isDirty = true`) and resets all state to defaults when clicked. Filter values are mapped to backend `filter_*` query params using `resolveFilterParams` inside `useTableData`, which reads `col.meta?.filterParam` to translate column ids to the correct param suffix.

### `RecordModal`

The generic modal shell used by all per-table modals. Handles:
- View / edit / history mode toggle
- Two-stage delete confirmation (Delete → "Are you sure?" → Confirm Delete)
- `isSaving` / `isDeleting` loading states with button disabling
- Admin-only Edit button; History button for existing records (when `getHistoryUrl` is provided in `useRecordModal` — optional, so modals backed by endpoints without a history route can omit it)

### `RecordHistoryView`

Renders the full audit trail for a single record. Fetches from `/{resource}/{id}/history` at mount. Shows each `audit_log` entry with:
- Operation badge (`CREATE` / `UPDATE` / `DELETE`)
- Timestamp and actor
- Field-level diff table for UPDATE entries (computed by `lib/computeDiff.ts`)
- Undo button (admin only, for unresolved entries)
- Acknowledged / Undone badges for resolved entries

### Per-table modals (`BrandModal`, `EffectModal`, etc.)

Each modal composes `RecordModal` and owns:
- Form state (`useState` initialized from the record or empty defaults)
- `saveMutation` and `deleteMutation` via `useMutation` (TanStack Query)
- View-mode field layout using `FieldRow`, `TypeBadges`, `ModelLinks`, `ParentLinks`
- Edit-mode form with `Input`, `Textarea`, `BrandSelect`, `ModelSelect`, and `MultiSelect` fields

`EffectModal`, `InstrumentModal`, and `LibraryModal` include a **Models** field (`ModelSelect` in edit mode, `ModelLinks` in view mode) and a **Parents** field (`ParentSelect` in edit mode, `ParentLinks` in view mode). `model_ids` and `parent_ids` are always sent to the API even when empty to allow clearing. The `excludeTable`/`excludeId` props on `ParentSelect` prevent a record from selecting itself as a parent.

`GearModal` is the gear-specific modal. It adds:
- **Pickup config** — `NativeSelect` (SSS/HH/HSH/SSH); guitar-only, shown only when the gear type is Guitar. Selecting a config renders conditional pickup slot inputs (neck/middle/bridge Model ID fields) based on the configuration's slot layout.
- **Photo upload** — file input in edit mode (existing records only; new records must be saved first). Uploads immediately on file selection via `api.uploadPhoto`, which sends raw binary with `Content-Type: image/jpeg|png|webp`. Independent of form save.
- **Maintenance log** — read-only section at the bottom of view mode, fetched from `GET /gearlist/gear/{id}/maintenance` on modal open.

### `ModelLinks`

Renders a `ModelRef[]` array as clickable badge chips. Clicking a chip fetches the full model record via `api.get('/models', id)` and opens a `ModelModal` as an overlay — no page navigation occurs. Closing the modal returns the user to their current context. If the fetch fails the click is silently ignored.

Props: `models: ModelRef[] | null | undefined`. Renders a `—` dash when the array is empty or absent.

### `MultiSelect`

A dropdown component for selecting multiple values from a lookup table. Fetches its options from `/config/{slug}` at render time. Used for all type/tag/format fields in edit mode.

### `ModelSelect`

A multi-value typeahead component for associating hardware models with an effect, instrument, or library. Debounces search input (300 ms) and calls `GET /models?filter_name=<query>` via `api.listPaged`. Results display with a checkbox indicator for already-selected items. Clicking a result toggles it; selected models appear as removable badges below the input. No inline creation — models must be created via the Models table first.

Props: `value: string[]` (selected `model_id`s), `selectedModels: ModelRef[]` (display names), `onChange: (ids, models) => void`.

### `ParentSelect`

A multi-value entity search component for assigning parent records (effects, instruments, or libraries) to a record. Debounces search input (300 ms) and calls `GET /search/entities?q=<query>` via `api.searchEntities`. When the query is empty and the input is focused, shows recently used parents from `localStorage` (managed by `lib/parentSelectRecents.ts`, max 10, deduplicated by `table_name + id`). Selected parents appear as removable badge chips. Display name is formatted as "Brand – Name" when a brand is present.

Props: `value: ParentId[]` (wire format — `{table_name, id}[]`), `selectedParents: ParentRef[]` (display — includes `name`), `onChange: (ids, refs) => void`, `excludeTable?: string`, `excludeId?: string`.

`ParentId` is exported from `components/ui/ParentSelect.tsx` and shared by `EffectModal`, `InstrumentModal`, and `LibraryModal`.

### `BulkEditBar`

The bulk action toolbar rendered above the table when one or more rows are selected (admin only). Shows the selection count, a field picker dropdown, a value input, an Apply button, and a two-stage bulk Delete control.

Field types supported:
- `multiselect` — renders `MultiSelect`; merges selected values into each row's existing array (non-destructive, deduplicates)
- `singleselect` — renders `MultiSelect` in single-select mode; replaces existing value
- `text` — renders a plain text `Input`; replaces existing value
- `parentsearch` — renders `ParentSelect` pre-populated with the union of all selected rows' existing parents as chips. Adding parents merges them into each row; removing a chip removes that parent from any row that had it. Apply is always enabled (allows clearing all parents).

### Search page (`app/search/page.tsx`)

The global search results page at `/search?q=<query>`. Calls `GET /search` via `api.searchGlobal`. Displays results grouped by table with:
- **Tab bar** — an All tab plus one tab per table with matches; clicking a tab filters the list
- **Notes toggle** — extends the search to description/notes fields when enabled
- Each result opens a `SearchRecordModal` in-place; a "Go to [Table]" button navigates to the table page and opens the record modal there

The search input lives in `TopBar` (fixed, visible on all pages). Submitting navigates to `/search?q=...`.

---

## Data flow

```
User action
    ↓
Component state (useState / useMutation)
    ↓
lib/api.ts (fetch wrapper — relative /api/... paths, no auth header needed)
    ↓
Next.js API route (server-side)
    reads httpOnly cookie → attaches Authorization: Bearer <token>
    ↓
FastAPI backend (internal Docker network)
    ↓
Semantic view (reads) / Base table (writes)
    ↓
Response → proxied back through Next.js → TanStack Query cache → re-render
```

The JWT never touches the browser. `lib/api.ts` makes plain `fetch` calls with no Authorization header — the Next.js catch-all proxy at `app/api/[...path]/route.ts` reads the httpOnly cookie and adds the header before forwarding to FastAPI.

On successful mutation, the modal calls `onMutate()` which triggers `queryClient.invalidateQueries` for the table's query key, causing the list to refetch.

---

## Authentication

`lib/auth.tsx` provides an `AuthContext` with:
- `username`, `role` — from the server session (no token in client state)
- `login(username, password)` — calls `POST /api/auth/token`; the BFF verifies credentials with FastAPI, then sets an httpOnly cookie and returns `{username, role}`
- `loginGoogle(credential)` — calls `POST /api/auth/google`; the BFF exchanges the Google ID token with FastAPI and sets the same httpOnly cookie
- `logout()` — calls `POST /api/auth/logout` (deletes the cookie), clears local state, redirects to `/login`

On mount, `AuthProvider` calls `GET /api/auth/me` to check for an existing session. If the cookie is valid, username and role are restored without a re-login. If not, the user is redirected to `/login`.

The JWT is stored exclusively in an httpOnly cookie — it cannot be read by JavaScript and is immune to XSS token theft. No token is present in `localStorage`, `sessionStorage`, or client-side state.

Route protection is handled by a client-side check in `AuthProvider` — unauthenticated users are redirected to `/login` after the session check resolves.

### BFF API routes

| Route | Method | Auth | Description |
|---|---|---|---|
| `/api/auth/token` | POST | none | Username/password login — calls FastAPI `/auth/token`, sets httpOnly cookie |
| `/api/auth/google` | POST | none | Google SSO login — calls FastAPI `/auth/google`, sets httpOnly cookie |
| `/api/auth/logout` | POST | cookie | Clears the `controlroom_token` cookie |
| `/api/scanner/scan` | POST | API key | Passes body + `Authorization` header directly to FastAPI `/scanner/scan`. Used by the Go binary — does NOT use the httpOnly cookie. |
| `/api/scanner/download/latest` | GET | cookie | Returns the most recent release object from MinIO `studio-downloads/plugin-scanner/`. |
| `/api/scanner/download/history` | GET | cookie | Returns all releases from that prefix, newest-first. |
| `/api/scanner/download/url` | GET | cookie | Query param `key=<object-key>`. Streams the zip directly from MinIO as a download. |
| `/api/[...path]` | GET/POST/PATCH/DELETE | cookie | Catch-all proxy — reads httpOnly cookie, adds `Authorization: Bearer`, forwards to FastAPI. Handles `/auth/me` and all other API calls. |

The cookie is named `controlroom_token` and is set with `httpOnly: true`, `secure: true`, `sameSite: lax`, and an 8-hour `maxAge`.

---

## Security headers

`next.config.mjs` applies four security headers to every response via the `headers()` config:

| Header | Value | Purpose |
|---|---|---|
| `X-Frame-Options` | `DENY` | Prevents clickjacking |
| `X-Content-Type-Options` | `nosniff` | Stops MIME-type sniffing |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Limits referrer leakage across origins |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | Disables unused browser APIs |

These are asserted by `tests/security/test_security_headers.py` against the running stack, run via `roadie test scan headers`.

---

## Styling

Tailwind CSS with a dark theme. CSS variables for colors are defined in `app/globals.css` and referenced via Tailwind utility classes. The sidebar uses `--sidebar-bg` and `--sidebar-border` variables for its distinct background.

shadcn/ui provides the base component primitives (Button, Input, Label, Dialog, Badge, etc.). These are not customized beyond what Tailwind classes allow.

---

## Testing

Unit tests use [Jest](https://jestjs.io/) + [React Testing Library](https://testing-library.com/).

- Tests live in `__tests__/` mirroring the `app/` and `components/` structure
- `@tanstack/react-query` mutations are tested by mocking `lib/api` and wrapping renders in a `QueryClientProvider`
- `lib/auth` is mocked globally in all component tests
- `useTableFilters` is unit-tested in `__tests__/lib/useTableFilters.test.ts` using `jest.useFakeTimers()` to verify debounce and 2-char minimum behavior
- `useSessionState` is unit-tested in `__tests__/lib/useSessionState.test.ts` — covers default initialisation, `isDirty` computation, localStorage persistence and restoration, per-user/queryKey isolation, `resetView`, and filter debounce
- `DataTableHeader` manual filtering is tested in `__tests__/components/DataTableHeader.manualFilter.test.tsx`
- The search page is tested in `__tests__/app/search/page.test.tsx`
- Google SSO paths are not tested — they require mocking the Google Identity Services API and a module-level env var that requires `jest.resetModules()`. Documented with a `NOTE:` comment in the relevant test files.

Coverage is collected via `jest --coverage` and reported to SonarQube as LCOV. New code must meet ≥ 80% line coverage to pass the quality gate.

End-to-end tests use [Playwright](https://playwright.dev/) and live in `e2e/`. They run against the dev frontend at `https://localhost:3001` with a separate test backend container (`controlroom_backend_test`) on port 5151 pointing at `masterdb_test`. Auth state is saved to `e2e/.auth/state.json` by the `auth.setup.ts` project and reused across tests. Run via `roadie test e2e`.

A separate Lighthouse performance suite lives in `e2e/perf.spec.ts` and runs against a production build pointed at `masterdb_test`. It asserts Core Web Vitals (LCP warns at 2500ms and hard-fails at 4000ms, TBT < 200ms, CLS < 0.1) and captures accessibility score, best-practices score, and a local CO₂ estimate as informational annotations. Auth cookies are seeded into the browser's default context via CDP (`Storage.setCookies`) before each audit — Lighthouse navigates independently of the Playwright isolated context, so `addCookies` alone is insufficient. Cookies are also re-added to the Playwright context per-test because Lighthouse's error-path cleanup clears browser storage. Run via `roadie test perf`.

E2E spec files:
- `crud.spec.ts` — row click opens and closes modal for all 18 tables
- `brands.spec.ts` — brand typeahead returns results in create modal; shows Create option for unknown brand names
- `bulk-edit.spec.ts` — bulk selection and apply flow
- `filter.spec.ts` — per-column filter operators across table types
- `sort.spec.ts` — multi-level sort via sort pills
- `infinite-scroll.spec.ts` — scroll-to-load behaviour on paginated tables
- `record-history.spec.ts` — audit history view in modal; operation badges and diff display
- `record-navigation.spec.ts` — navigating from search results to the full table page and reopening the modal
- `search.spec.ts` — global search: TopBar query navigation, results page, tab filtering, deep-link to record modal
- `gearlist.spec.ts` — GearList module: guitars and other gear pages load; create modal opens; gear row click opens detail modal; guitar edit mode shows pickup config select
- `scanner.spec.ts` — ControlRoom scanner bucket pages (known/matched/conflicted/etc.): load without error, empty-state rendering; rules page loads all three sections; Add Rule button opens creation form
- `scanner-workbench.spec.ts` — Scan Workbench page: loads with heading and filter bar; Soft Reset toast; needs_review row click opens SingleResolutionModal and saving closes it (row click routes by bucket; select-all header checkbox toggles on/off)
- `scanner-collision.spec.ts` — collision row opens the record-centric CollisionModal; Keep all acknowledges every copy and the modal closes (U-18)
- `plugin-scanner.spec.ts` — Studio Management plugin-scanner admin page: page load, API key manager renders, generate-key button visible, release card visible
- `stats.spec.ts` — Admin stats page row counts render
- `backup.spec.ts` — Backup and restore page loads
- `change-review.spec.ts` — Change Review page loads with pending entries
- `smoke.spec.ts` — Smoke tests: all major pages load without JS errors
- `perf.spec.ts` — Lighthouse Core Web Vitals (LCP, TBT, CLS) across all major pages
