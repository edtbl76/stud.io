# Design: Google SSO + RBAC

**Date:** 2026-03-16
**Status:** Approved
**Project:** STUD.io ControlRoom

---

## Overview

Add Google Sign-In as an alternative to password login, and introduce a two-role access control model (Admin / User). Admins have full read-write access; Users are read-only. Role enforcement happens at both the API and UI layers.

---

## Goals

- Allow any Google account to sign in without a password
- Allow users to link a Google account to their own existing password account ("sync")
- A user account can have a password, a Google account, or both — but must always have at least one
- Two roles: `admin` (full access) and `user` (read-only)
- New Google sign-ins default to `user` role; admins promote as needed
- Password login remains available alongside Google login

---

## Out of Scope

- Rate limiting / abuse protection (local app, trusted users)
- Frontend component or E2E tests (manual verification only for UI flows)
- Token refresh / JWT invalidation on role change (accepted limitation — role change takes effect on next login; the Users page displays a note to this effect)
- Unlinking a Google account (no `DELETE /users/{id}/google` in this iteration)
- Admin linking Google accounts on behalf of other users — each user links their own account by clicking the button on their own row

---

## Schema Changes

```sql
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'
    CHECK (role IN ('admin', 'user'));

ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

ALTER TABLE users ADD COLUMN google_id TEXT UNIQUE;

ALTER TABLE users ADD COLUMN email TEXT UNIQUE;

ALTER TABLE users ADD CONSTRAINT users_must_have_auth
    CHECK (password_hash IS NOT NULL OR google_id IS NOT NULL);
```

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `role` | TEXT | No | `'admin'` or `'user'`, default `'user'` |
| `password_hash` | TEXT | Yes | Null for Google-only accounts |
| `google_id` | TEXT | Yes | Google `sub` claim, unique |
| `email` | TEXT | Yes | From Google token, unique |

**Migration:** All existing users get `role = 'user'` via the DB default. The startup `seed_default_admin` function is updated to explicitly set `role = 'admin'` for the seeded admin user. Existing users keep `google_id = NULL` and `email = NULL` until they link a Google account. Auto-created Google users will have `password_hash = NULL`; they can set a password later via the existing `PATCH /users/{id}/password` endpoint.

**Constraint enforcement:** The `users_must_have_auth` CHECK constraint is the DB-level guard. The application also enforces this before the DB operation and returns HTTP 400 with a clear message. Both layers must agree.

---

## Backend

### New Dependency

`google-auth>=2.38.0` added to `requirements.txt`. Used via `google.oauth2.id_token.verify_oauth2_token()` with `google.auth.transport.requests.Request()` to verify Google ID tokens cryptographically. `GOOGLE_CLIENT_ID` is passed as the expected `audience` to validate the `aud` claim.

### Configuration

New field in `config.py`:

```python
google_client_id: str = ""  # empty string = Google login disabled
```

Added to `docker-compose.yml`:
- `controlroom_backend` environment: `GOOGLE_CLIENT_ID`
- `frontend` environment: `NEXT_PUBLIC_GOOGLE_CLIENT_ID`

Both must be set to the same value.

### JWT

`role` added to JWT payload alongside `sub`:

```python
{"sub": username, "role": role, "exp": expire}
```

JWT TTL unchanged (`jwt_expire_minutes`). Role changes take effect on next login — the Users page displays "Role change takes effect on next login" as a note when toggling a role.

### `GET /users` Response Schema

Returns `role` and `google_linked` so the Users page can display accurate state without decoding tokens client-side.

```json
[
  {
    "user_id": "...",
    "username": "...",
    "role": "admin",
    "created_at": "...",
    "google_linked": true
  }
]
```

`google_linked` is `true` if `google_id IS NOT NULL`. `google_id` itself is never returned to clients.

`GET /users` requires authentication but is **not** admin-only — any logged-in user can call it (needed to render their own row in the Users page).

### `POST /auth/google`

Request body: `{ "credential": "<Google ID token>" }`

Flow:
1. If `GOOGLE_CLIENT_ID` is empty → 501 Not Implemented
2. Verify credential via `verify_oauth2_token()` → 401 if invalid or expired
3. Extract `sub` and `email` from verified payload
4. Look up user by `google_id = sub`
5. **Found** → issue app JWT
6. **Not found, email matches existing account's `email` column** → 409 `"An account with this email already exists. Sign in with your password, then link your Google account from the Users page."`
7. **Not found, `email` value matches an existing `username`** → auto-create with `username = email + "_google"` (append `_google` suffix to avoid collision); if that is also taken, append `_1`, `_2`, etc.
8. **Not found, no collision** → auto-create with `username = email`, `google_id = sub`, `email = email`, `role = 'user'`; issue app JWT

Returns `{ access_token, token_type }`.

### `require_admin` Dependency

Raises HTTP 403 if JWT `role` claim is not `'admin'`.

**Applied to (write operations and admin routes):**
- All POST, PATCH, DELETE on: `/brands`, `/models`, `/effects`, `/instruments`, `/libraries`, `/workstations`, `/tools`, `/config/*`
- All `/admin` routes (backup, restore)
- `PATCH /users/{id}/role`

**Not applied to:**
- All GET endpoints (read-only access for all authenticated users)
- `/auth/token`, `/auth/google`, `/auth/me`
- `GET /users`
- `PATCH /users/{id}/password` (users can change their own password; ownership check handled in the endpoint)
- `PATCH /users/{id}/google` (see authorization below)

### `PATCH /users/{id}/role`

- Requires `require_admin`
- Request: `{ "role": "admin" | "user" }`
- Response: 204 No Content
- Guard: if the target user is the only remaining admin → HTTP 400 `"Cannot demote the last admin"`
- An admin may demote themselves if other admins exist

### `PATCH /users/{id}/google`

- Authorization: `current_user.user_id == id OR current_user.role == 'admin'` — any user may link their own account; an admin may link any account (using the admin's own Google credential)
- Request: `{ "credential": "<Google ID token>" }`
- Flow:
  1. Check authorization → 403 if not self and not admin
  2. Verify credential via `verify_oauth2_token()` → 401 if invalid
  3. Extract `sub` and `email`
  4. If target user already has a `google_id` → 409 `"Google account already linked. Unlink first before linking a new one."`
  5. If `google_id` (`sub`) is already linked to a different account → 409 `"This Google account is already linked to another user"`
  6. Update user: `google_id = sub`, `email = email`
  7. Response: 204 No Content

---

## Frontend

### Configuration

`NEXT_PUBLIC_GOOGLE_CLIENT_ID` in `docker-compose.yml` frontend environment. Google button renders only if this variable is non-empty.

### Login Page

- Existing username/password form is unchanged
- If `NEXT_PUBLIC_GOOGLE_CLIENT_ID` is set: a horizontal divider and Google Sign-In button appear below the form
- GIS script loaded with `strategy="afterInteractive"` — the button renders after hydration (a brief flash is acceptable on first load; login is not time-critical)
- `window.google.accounts.id.initialize({ client_id, callback })` called once the script loads
- Button rendered with `window.google.accounts.id.renderButton()`

**GIS callback flow:**
1. Receive `{ credential }` from GIS
2. Set loading state, clear any prior error
3. POST `{ credential }` to `/auth/google`
4. On 200: store JWT, update auth context, redirect to `/`
5. On 409: show the API `detail` message inline
6. On any other error: show `"Google sign-in failed"`
7. Popup dismissed (no credential): no action, no error

### `useAuth` Context

`role: 'admin' | 'user' | null` added. On token restore from localStorage, role is decoded from the JWT payload (no extra API call). JWT is the client-side source of truth for role. `google_linked` state is not stored in the auth context — it is read from `GET /users` on the Users page.

### Role-Aware UI

**Sidebar:**
The entire ADMIN group (`Backup & Restore`, `Users`) is hidden for `role = 'user'`. Non-admins cannot navigate to the Users page.

**Tables (all list views):**
For `role = 'user'`:
- `[+ Add]` button hidden
- Edit and delete controls hidden per row
- Rows still open the read-only modal; `[Edit]` button inside modal does not appear

**Users page:**
- Role badge displayed next to each username
- Role toggle button — admin-only; shows a tooltip `"Role change takes effect on next login"` on hover; blocked with tooltip `"Cannot demote the last admin"` if applicable
- "Link Google" button — shown on the current user's own row only (regardless of admin status); on other rows, shows a `Google: linked` or `Google: —` indicator
- "Link Google" flow: triggers `window.google.accounts.id.prompt()` (One Tap), receives credential, calls `PATCH /users/{id}/google`; on 204 button changes to `Google: linked`; on 409 shows inline error

---

## Testing

### `test_auth.py` additions

- `POST /auth/google` with valid mocked token (new user) → 201, returns JWT, `role = 'user'`
- `POST /auth/google` with valid mocked token (returning user, existing `google_id`) → 200, returns JWT
- `POST /auth/google` with invalid token → 401
- `POST /auth/google` where email matches existing password-only account's `email` column → 409
- `POST /auth/google` when `GOOGLE_CLIENT_ID` is empty → 501

### `test_users.py` additions

- `PATCH /users/{id}/role` — admin changes another user's role → 204
- `PATCH /users/{id}/role` — non-admin → 403
- `PATCH /users/{id}/role` — demoting last admin → 400
- `PATCH /users/{id}/role` — admin self-demotion when other admins exist → 204
- `PATCH /users/{id}/google` — user links own account (valid token) → 204, `google_id` set
- `PATCH /users/{id}/google` — admin links another user's account → 204
- `PATCH /users/{id}/google` — non-admin links another user's account → 403
- `PATCH /users/{id}/google` — `google_id` already claimed by another user → 409
- `PATCH /users/{id}/google` — target user already has a `google_id` → 409
- `PATCH /users/{id}/google` — invalid Google token → 401
- `GET /users` includes `role` and `google_linked` fields

### `test_rbac.py` (new file)

- Admin can POST on a resource (e.g. `/brands`) → 201
- User gets 403 on POST to any resource
- Admin can PATCH a resource → 200
- User gets 403 on PATCH
- Admin can DELETE a resource → 204
- User gets 403 on DELETE
- User can GET all resources → 200
- Admin can GET `/admin/backup` → 200
- User gets 403 on `GET /admin/backup`
- User gets 403 on `POST /admin/restore`

All Google token verification calls are mocked — no real Google network calls in tests.

---

## Setup (User Action Required)

Before the Google Sign-In button appears, a Google OAuth 2.0 Client ID must be created:

1. [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials
2. Create **OAuth 2.0 Client ID** → Web application type
3. Authorized JavaScript origins: `http://localhost:2112`
4. Copy the Client ID into `docker-compose.yml`:
   - `controlroom_backend`: `GOOGLE_CLIENT_ID: <your-client-id>`
   - `frontend`: `NEXT_PUBLIC_GOOGLE_CLIENT_ID: <your-client-id>`
5. Rebuild: `docker compose up -d --build`
