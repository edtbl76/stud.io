# Frontend

## Overview

The frontend is a [Next.js](https://nextjs.org/) 16 app (App Router) written in TypeScript with React 19, styled with [Tailwind CSS](https://tailwindcss.com/) and [shadcn/ui](https://ui.shadcn.com/) primitives. It runs as a dev server inside Docker for development and E2E testing; a production build is used for the Lighthouse performance suite.

- App URL: `https://localhost:2112`
- All API calls are relative `/api/...` paths — the Next.js server proxies them to FastAPI internally

The app is a **Backend for Frontend (BFF)**. There is no browser-visible backend URL. The browser talks only to the Next.js server; Next.js holds the JWT in an httpOnly cookie and attaches it to every request it forwards to FastAPI. This architecture eliminates CORS issues, hides the backend URL from clients, and makes the app fully accessible from any machine on the network without configuration changes.

---

## Directory structure

```
app/controlroom_frontend/
├── app/                    # Next.js App Router pages and API routes
│   ├── api/                # BFF API routes (server-side)
│   │   ├── auth/
│   │   │   ├── token/      # POST — username/password login
│   │   │   ├── google/     # POST — Google SSO login
│   │   │   ├── logout/     # POST — cookie deletion
│   │   │   └── session.ts  # Shared helper: calls FastAPI /auth/me, sets httpOnly cookie
│   │   └── [...path]/      # Catch-all proxy — forwards all other requests to FastAPI
│   ├── login/              # Login page
│   ├── catalog/            # Brands, Models
│   ├── session/            # Effects, Instruments, Libraries, Workstations
│   ├── tools/              # Admin, Composition, Measurement, Reference, Workflow tools
│   ├── config/             # Lookup table editors (7 tables)
│   ├── search/             # Global search results page (/search?q=...)
│   └── admin/              # Stats, Change Review, Import/Export, Backup/Restore, Users
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
│   ├── layout/             # LayoutShell, Sidebar, TopBar
│   ├── tables/             # Per-table modal and column definitions
│   │   ├── brands/         # BrandModal, columns
│   │   ├── models/         # ModelModal, columns
│   │   ├── effects/        # EffectModal, columns
│   │   ├── instruments/    # InstrumentModal, columns
│   │   ├── libraries/      # LibraryModal, columns
│   │   ├── workstations/   # WorkstationModal, columns
│   │   ├── tools/          # ToolModal, columns (shared by all 5 tool tables)
│   │   └── config/         # ConfigModal, columns (shared by all 7 lookup tables)
│   └── ui/                 # shadcn/ui primitives (Button, Input, Dialog, etc.)
├── lib/
│   ├── api.ts                   # Typed fetch wrapper — calls relative /api/... paths
│   ├── auth.tsx                 # AuthContext, useAuth hook, session management
│   ├── bulkEdit.ts              # BulkEditField interface — type union: multiselect, singleselect, text, parentsearch
│   ├── columnMeta.ts            # TypeScript module augmentation — adds filterParam and defaultHidden to TanStack ColumnMeta
│   ├── computeDiff.ts           # Field-level diff between two JSON snapshots (for history view)
│   ├── parentSelectRecents.ts   # localStorage utility for recent ParentSelect picks — max 10, deduplicated by (table_name, id)
│   ├── types.ts                 # TypeScript interfaces for all API response shapes
│   ├── useSessionState.ts       # Hook: per-user, per-table localStorage persistence for filters, sorting, column visibility, and column sizing. Exposes isDirty and resetView.
│   ├── useTableData.ts          # Hook: data fetching for TablePage — handles paginated (useInfiniteQuery) and non-paginated (useQuery) modes, resolves filter params
│   ├── useTableFilters.ts       # Hook: per-column filter state with 350 ms debounce and 2-char minimum (used standalone; session state supersedes this for TablePage)
│   └── utils.ts                 # Tailwind class merge utility (cn), formatSlug, formatDate
├── __tests__/              # Jest + React Testing Library unit tests
└── e2e/                    # Playwright end-to-end tests (run against test stack on port 3001)
```

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
- Admin-only Edit button; History button for existing records (any authenticated user)

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
- Each result is a link to the source table page with `?open=<id>`, which causes `TablePage` to auto-open the record's modal on arrival

The search input lives in `Sidebar` (not in a per-page toolbar). Submitting the form navigates to `/search?q=...`.

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

| Route | Method | Description |
|---|---|---|
| `/api/auth/token` | POST | Username/password login — calls FastAPI `/auth/token`, sets cookie |
| `/api/auth/google` | POST | Google SSO login — calls FastAPI `/auth/google`, sets cookie |
| `/api/auth/logout` | POST | Clears the `controlroom_token` cookie |
| `/api/[...path]` | GET/POST/PATCH/DELETE | Catch-all proxy — reads cookie, adds Bearer header, forwards to FastAPI (handles `/auth/me` and all other API calls) |

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

End-to-end tests use [Playwright](https://playwright.dev/) and live in `e2e/`. They run against the dev frontend at `https://localhost:2112` with a separate test backend container (`controlroom_backend_test`) on port 5151 pointing at `controlroomdb_test`. Auth state is saved to `e2e/.auth/state.json` by the `auth.setup.ts` project and reused across tests. Run via `roadie test e2e`.

A separate Lighthouse performance suite lives in `e2e/perf.spec.ts` and runs against a production build pointed at `controlroomdb_test`. It asserts Core Web Vitals (LCP warns at 2500ms and hard-fails at 4000ms, TBT < 200ms, CLS < 0.1) and captures accessibility score, best-practices score, and a local CO₂ estimate as informational annotations. Auth cookies are seeded into the browser's default context via CDP (`Storage.setCookies`) before each audit — Lighthouse navigates independently of the Playwright isolated context, so `addCookies` alone is insufficient. Cookies are also re-added to the Playwright context per-test because Lighthouse's error-path cleanup clears browser storage. Run via `roadie test perf`.

E2E spec files:
- `crud.spec.ts` — row click opens and closes modal for all 18 tables
- `brands.spec.ts` — brand typeahead returns results in create modal; shows Create option for unknown brand names
- `bulk-edit.spec.ts` — bulk selection and apply flow
- `search.spec.ts` — global search: TopBar query navigation, results page, tab filtering, deep-link to record modal
