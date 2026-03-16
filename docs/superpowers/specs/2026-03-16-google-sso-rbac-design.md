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
- Allow existing password accounts to link a Google account ("sync")
- A user account can have a password, a Google account, or both — but must have at least one
- Two roles: `admin` (full access) and `user` (read-only)
- New Google sign-ins default to `user` role; admins promote as needed
- Password login remains available alongside Google login

---

## Schema Changes

Four changes to the `users` table:

```sql
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'
    CHECK (role IN ('admin', 'user'));

ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

ALTER TABLE users ADD COLUMN google_id TEXT UNIQUE;

ALTER TABLE users ADD COLUMN email TEXT;

ALTER TABLE users ADD CONSTRAINT users_must_have_auth
    CHECK (password_hash IS NOT NULL OR google_id IS NOT NULL);
```

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `role` | TEXT | No | `'admin'` or `'user'`, default `'user'` |
| `password_hash` | TEXT | Yes | Null for Google-only accounts |
| `google_id` | TEXT | Yes | Google `sub` claim, unique |
| `email` | TEXT | Yes | From Google token; used as display username for Google accounts |

The seeded default `admin` user gets `role = 'admin'`. All auto-created Google users get `role = 'user'`.

---

## Backend

### New Dependency

`google-auth` added to `requirements.txt` for cryptographic verification of Google ID tokens.

### Configuration

`GOOGLE_CLIENT_ID` added to `config.py` (optional — if unset, the Google button is hidden on the frontend). Added to `docker-compose.yml` for both `controlroom_backend` and `controlroom_frontend` services.

### New Endpoint: `POST /auth/google`

Accepts a Google Identity Services `credential` (signed JWT).

1. Verify the credential against Google's public keys using `google-auth`
2. Extract `sub` (Google user ID) and `email` from the verified payload
3. Look up user by `google_id`
4. If found → log in, issue app JWT
5. If not found → auto-create user (`username = email`, `google_id = sub`, `role = 'user'`), issue app JWT

Returns the same `{ access_token, token_type }` response as `POST /auth/token`.

### Role in JWT

`role` added to JWT payload alongside `sub`:

```python
{"sub": username, "role": role, "exp": expire}
```

`get_current_user` returns `role` in `UserOut`.

### `require_admin` Dependency

New FastAPI dependency that reads `role` from the validated JWT and raises `HTTP 403` if it is not `'admin'`. Applied to:

- All POST, PATCH, DELETE endpoints across all routers
- All `/admin` routes (backup, restore)

### Users Router Additions

| Endpoint | Description |
|---|---|
| `PATCH /users/{id}/role` | Admin-only. Change role between `admin` and `user`. |
| `PATCH /users/{id}/google` | Link a Google account to an existing user. Accepts a Google `credential`, verifies it, stores `sub` and `email`. |

**Constraint enforcement:** Cannot unlink a login method if it is the account's only one (enforced by the `users_must_have_auth` check constraint + application-level guard).

---

## Frontend

### Configuration

`NEXT_PUBLIC_GOOGLE_CLIENT_ID` added to `docker-compose.yml` frontend environment. The Google Sign-In button renders only if this variable is set — the app functions without it.

### Login Page

- Existing username/password form is unchanged
- If `NEXT_PUBLIC_GOOGLE_CLIENT_ID` is set: a divider and "Sign in with Google" button appear below the form
- Google Identity Services script (`https://accounts.google.com/gsi/client`) loaded via Next.js `Script` component
- On GIS callback, the `credential` is POSTed to `POST /auth/google`
- On success, the app JWT is stored in localStorage and the user is redirected — same flow as password login

### `useAuth` Context

`role: 'admin' | 'user' | null` added alongside `token` and `username`. All gating reads from `useAuth()`.

### Role-Aware UI

**Sidebar:**
The ADMIN group (`Backup & Restore`, `Users`) is hidden entirely for `role = 'user'`.

**Tables (all list views):**
For non-admins:
- `[+ Add]` button hidden
- Edit and delete controls hidden
- Rows still open in read-only modal; `[Edit]` button inside modal does not appear

**Users page (admin-only features):**
- Role badge displayed next to each username
- Role toggle button per row (admin only)
- "Link Google" button per row — triggers a Google sign-in flow and links the resulting account to that user

---

## Testing

### `test_auth.py` additions

- `POST /auth/google` with valid mocked token → 200, returns JWT
- `POST /auth/google` with invalid token → 401
- `POST /auth/google` for new Google user → auto-creates with `user` role
- `POST /auth/google` for returning Google user → finds existing, logs in

### `test_users.py` additions

- `PATCH /users/{id}/role` — admin can change role
- `PATCH /users/{id}/role` — non-admin gets 403
- `PATCH /users/{id}/google` — links Google ID to existing user
- Cannot remove last login method (application-level guard)

### `test_rbac.py` (new file)

- Admin can POST/PATCH/DELETE on any resource
- User gets 403 on all write endpoints
- User can GET all resources (read-only confirmed)
- Backup and restore return 403 for non-admin
- Google token verification mocked in all tests (no real Google calls)

---

## Setup Required (by user)

Before this feature works, a Google OAuth 2.0 Client ID must be created:

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials
2. Create an OAuth 2.0 Client ID (Web application type)
3. Add authorized JavaScript origins: `http://localhost:2112`
4. Copy the Client ID into `docker-compose.yml` as `GOOGLE_CLIENT_ID` / `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
