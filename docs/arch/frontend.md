# Frontend

## Overview

The frontend is a [Next.js](https://nextjs.org/) 14 app (App Router) written in TypeScript, styled with [Tailwind CSS](https://tailwindcss.com/) and [shadcn/ui](https://ui.shadcn.com/) primitives. It runs as a dev server inside Docker — there is no production build step.

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
│   │   │   ├── me/         # GET  — session check (proxied to FastAPI /auth/me)
│   │   │   └── session.ts  # Shared helper: calls /auth/me, sets httpOnly cookie
│   │   └── [...path]/      # Catch-all proxy — forwards all other requests to FastAPI
│   ├── login/              # Login page
│   ├── catalog/            # Brands, Models
│   ├── session/            # Effects, Instruments, Libraries, Workstations
│   ├── tools/              # Admin, Composition, Measurement, Reference, Workflow tools
│   ├── config/             # Lookup table editors (7 tables)
│   └── admin/              # Backup/Restore, Users
├── components/
│   ├── DataTable.tsx        # Virtualized TanStack Table wrapper
│   ├── TablePage.tsx        # Generic page: search + table + modal
│   ├── RecordModal.tsx      # Generic modal shell: view/edit/delete lifecycle
│   ├── FieldRow.tsx         # Label + value display row (handles empty states)
│   ├── TypeBadges.tsx       # Renders [{id, name}] arrays as badge pills
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
│   ├── api.ts              # Typed fetch wrapper — calls relative /api/... paths
│   ├── auth.tsx            # AuthContext, useAuth hook, session management
│   ├── types.ts            # TypeScript interfaces for all API response shapes
│   └── utils.ts            # Tailwind class merge utility (cn)
└── __tests__/              # Jest + React Testing Library unit tests
```

---

## Key components

### `TablePage<T>`

The generic page component used by every catalog/session/tools/config page. Accepts:
- `title`, `endpoint`, `queryKey` — page identity
- `columns` — TanStack Table column definitions
- `getRowId` — extracts the primary key from a row
- `renderModal` — callback that renders the appropriate modal for the table

Handles: data fetching via `useQuery`, search with 300ms debounce, Add button (admin only), row click → modal open, modal close + query invalidation on mutation.

### `RecordModal`

The generic modal shell used by all per-table modals. Handles:
- View mode vs. edit mode toggle
- Two-stage delete confirmation (Delete → "Are you sure?" → Confirm Delete)
- `isSaving` / `isDeleting` loading states with button disabling
- Admin-only Edit button

### Per-table modals (`BrandModal`, `EffectModal`, etc.)

Each modal composes `RecordModal` and owns:
- Form state (`useState` initialized from the record or empty defaults)
- `saveMutation` and `deleteMutation` via `useMutation` (TanStack Query)
- View-mode field layout using `FieldRow`, `TypeBadges`, `ParentLinks`
- Edit-mode form with `Input`, `Textarea`, and `MultiSelect` fields

### `MultiSelect`

A dropdown component for selecting multiple values from a lookup table. Fetches its options from `/config/{slug}` at render time. Used for all type/tag/format fields in edit mode.

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
| `/api/auth/me` | GET | Session check — proxied to FastAPI `/auth/me` via the catch-all |
| `/api/[...path]` | GET/POST/PATCH/DELETE | Catch-all proxy — reads cookie, adds Bearer header, forwards to FastAPI |

The cookie is named `controlroom_token` and is set with `httpOnly: true`, `secure: true`, `sameSite: lax`, and an 8-hour `maxAge`.

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
- Google SSO paths are not tested — they require mocking the Google Identity Services API and a module-level env var that requires `jest.resetModules()`. Documented with a `NOTE:` comment in the relevant test files.

Coverage is collected via `jest --coverage` and reported to SonarQube as LCOV. New code must meet ≥ 80% line coverage to pass the quality gate.
