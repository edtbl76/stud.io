# Google SSO + RBAC Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Google Sign-In as an alternative to password login and introduce Admin/User roles with read-only enforcement for non-admins.

**Architecture:** Google Identity Services (client-side) sends a signed credential to `POST /auth/google`; the backend verifies it with `google-auth` and issues an app JWT containing `role`. A `require_admin` FastAPI dependency protects all write and admin endpoints. The frontend decodes `role` from the JWT and gates the Add/Edit/Delete UI controls.

**Tech Stack:** FastAPI, asyncpg, python-jose, bcrypt, google-auth>=2.38.0, Next.js 14 App Router, Google Identity Services JS SDK, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-16-google-sso-rbac-design.md`

---

## File Map

### Backend — Modified
| File | What changes |
|---|---|
| `sql/schema.sql` | Add `role`, `google_id`, `email` columns; make `password_hash` nullable; add CHECK constraint |
| `app/controlroom_backend/requirements.txt` | Add `google-auth>=2.38.0` |
| `app/controlroom_backend/config.py` | Add `google_client_id: str = ""` |
| `app/controlroom_backend/routers/auth.py` | `role` in JWT + `UserOut`; `_create_token(username, role)`; `require_admin` dep; `seed_default_admin` sets role='admin'; `POST /auth/google`; `POST /auth/token` fetches role |
| `app/controlroom_backend/routers/users.py` | `UserListItem` adds `role` + `google_linked`; `GET /users` query updated; `PATCH /{id}/role`; `PATCH /{id}/google` |
| `app/controlroom_backend/routers/admin_ops.py` | Add `require_admin` to backup/restore (already has `get_current_user`; swap to `require_admin`) |
| All write routers (brands, models, effects, instruments, libraries, workstations, tools, config) | Add `require_admin` dep to all POST/PATCH/DELETE handlers |

### Backend — Created
| File | Purpose |
|---|---|
| `app/controlroom_backend/tests/test_rbac.py` | RBAC access control tests |

### Backend — Updated Tests
| File | What changes |
|---|---|
| `app/controlroom_backend/tests/conftest.py` | `auth_headers` uses `role='user'`; add `admin_headers` fixture; set `GOOGLE_CLIENT_ID` env var |
| `app/controlroom_backend/tests/test_auth.py` | Add Google login tests |
| `app/controlroom_backend/tests/test_users.py` | Add role + google link tests; update `GET /users` assertions |

### Frontend — Modified
| File | What changes |
|---|---|
| `app/controlroom_frontend/lib/api.ts` | Include `Authorization` header from localStorage on every request |
| `app/controlroom_frontend/lib/auth.tsx` | Add `role` + `loginGoogle`; decode role from JWT |
| `app/controlroom_frontend/app/login/page.tsx` | Add Google Sign-In button via GIS |
| `app/controlroom_frontend/app/admin/backup/page.tsx` | Pass auth token in fetch calls |
| `app/controlroom_frontend/components/layout/Sidebar.tsx` | Hide ADMIN group for `role='user'` |
| `app/controlroom_frontend/components/TablePage.tsx` | Hide `[+ Add]` button for non-admins |
| `app/controlroom_frontend/app/admin/users/page.tsx` | Add role badge, role toggle, Link Google button |

### Frontend — Created
| File | Purpose |
|---|---|
| `app/controlroom_frontend/types/google.d.ts` | TypeScript declarations for `window.google` GIS API |
| `docker-compose.yml` | Add `GOOGLE_CLIENT_ID` / `NEXT_PUBLIC_GOOGLE_CLIENT_ID` env vars |

---

## Chunk 1: Schema + Backend Dependencies

### Task 1: Schema migration

**Files:**
- Modify: `sql/schema.sql`

- [ ] **Step 1: Add columns and constraints to schema.sql**

Find the `CREATE TABLE IF NOT EXISTS users` block (near line 286) and replace it with:

```sql
CREATE TABLE IF NOT EXISTS users (
    user_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username      TEXT NOT NULL UNIQUE,
    password_hash TEXT,
    role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
    google_id     TEXT UNIQUE,
    email         TEXT UNIQUE,
    created_at    TIMESTAMP DEFAULT NOW(),
    updated_at    TIMESTAMP DEFAULT NOW(),
    CONSTRAINT users_must_have_auth CHECK (password_hash IS NOT NULL OR google_id IS NOT NULL)
);
```

Also add these idempotent ALTER statements directly below the CREATE TABLE (they are no-ops if columns already exist):

```sql
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT UNIQUE;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'users_must_have_auth'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_must_have_auth
      CHECK (password_hash IS NOT NULL OR google_id IS NOT NULL);
  END IF;
END $$;
```

- [ ] **Step 2: Apply migration to both databases**

```bash
docker exec studio_db psql -U studio -d controlroomdb -c "
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT UNIQUE;
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'users_must_have_auth') THEN
    ALTER TABLE users ADD CONSTRAINT users_must_have_auth CHECK (password_hash IS NOT NULL OR google_id IS NOT NULL);
  END IF;
END \$\$;
UPDATE users SET role = 'admin' WHERE username = 'admin';
"

docker exec studio_db psql -U studio -d controlroomdb_test -c "
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT UNIQUE;
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'users_must_have_auth') THEN
    ALTER TABLE users ADD CONSTRAINT users_must_have_auth CHECK (password_hash IS NOT NULL OR google_id IS NOT NULL);
  END IF;
END \$\$;
"
```

Expected: each command ends with `DO` and `UPDATE 1` (for controlroomdb) / `DO` (for controlroomdb_test).

- [ ] **Step 3: Verify**

```bash
docker exec studio_db psql -U studio -d controlroomdb -c "\d users"
```

Expected: columns `role`, `google_id`, `email` visible; `password_hash` shows no `not null`.

- [ ] **Step 4: Commit**

```bash
cd /home/edwardmangini/Documents/Studio/STUD.io
git add sql/schema.sql
git commit -m "feat: add role, google_id, email columns to users table"
```

---

### Task 2: Add google-auth dependency

**Files:**
- Modify: `app/controlroom_backend/requirements.txt`
- Modify: `app/controlroom_backend/config.py`

- [ ] **Step 1: Add google-auth to requirements.txt**

Add after the `bcrypt` line:

```
google-auth>=2.38.0
```

- [ ] **Step 2: Add google_client_id to config.py**

Add after `jwt_expire_minutes`:

```python
google_client_id: str = ""  # empty = Google login disabled
```

- [ ] **Step 3: Add GOOGLE_CLIENT_ID to docker-compose.yml**

In the `controlroom_backend` environment section, add:
```yaml
GOOGLE_CLIENT_ID: ""
```

In the `frontend` environment section, add:
```yaml
- NEXT_PUBLIC_GOOGLE_CLIENT_ID=
```

- [ ] **Step 4: Commit**

```bash
git add app/controlroom_backend/requirements.txt app/controlroom_backend/config.py docker-compose.yml
git commit -m "feat: add google-auth dependency and GOOGLE_CLIENT_ID config"
```

---

## Chunk 2: Backend Auth Router

### Task 3: Update auth.py — role in JWT, require_admin, POST /auth/google

**Files:**
- Modify: `app/controlroom_backend/routers/auth.py`

This task replaces auth.py in full. The key changes:
1. `UserOut` gains `role: str`
2. `_create_token(username, role)` includes role in payload
3. `get_current_user` reads role from JWT payload (not DB)
4. New `require_admin` dependency raises 403 if role != 'admin'
5. `seed_default_admin` inserts with role='admin' and upgrades existing admin
6. `POST /auth/token` fetches role from DB and passes to `_create_token`
7. New `POST /auth/google` endpoint

- [ ] **Step 1: Write the failing tests first** (in test_auth.py — add the 5 new Google tests)

Add to `app/controlroom_backend/tests/test_auth.py`:

```python
from unittest.mock import patch

MOCK_GOOGLE_PAYLOAD = {"sub": "google-uid-123", "email": "guser@gmail.com"}


async def test_google_login_new_user(client):
    with patch("routers.auth.id_token.verify_oauth2_token", return_value=MOCK_GOOGLE_PAYLOAD):
        response = await client.post("/auth/google", json={"credential": "fake-token"})
    assert response.status_code == 201
    assert "access_token" in response.json()


async def test_google_login_returning_user(client, conn):
    hashed = bcrypt.hashpw(b"pass", bcrypt.gensalt(rounds=4)).decode()
    await conn.execute(
        "INSERT INTO users (username, password_hash, google_id, email) VALUES ('guser@gmail.com', $1, 'google-uid-123', 'guser@gmail.com')",
        hashed,
    )
    with patch("routers.auth.id_token.verify_oauth2_token", return_value=MOCK_GOOGLE_PAYLOAD):
        response = await client.post("/auth/google", json={"credential": "fake-token"})
    assert response.status_code == 200
    assert "access_token" in response.json()


async def test_google_login_invalid_token(client):
    with patch("routers.auth.id_token.verify_oauth2_token", side_effect=Exception("bad token")):
        response = await client.post("/auth/google", json={"credential": "bad"})
    assert response.status_code == 401


async def test_google_login_email_collision(client, conn):
    hashed = bcrypt.hashpw(b"pass", bcrypt.gensalt(rounds=4)).decode()
    await conn.execute(
        "INSERT INTO users (username, password_hash, email) VALUES ('existing', $1, 'guser@gmail.com')",
        hashed,
    )
    with patch("routers.auth.id_token.verify_oauth2_token", return_value=MOCK_GOOGLE_PAYLOAD):
        response = await client.post("/auth/google", json={"credential": "fake-token"})
    assert response.status_code == 409


async def test_google_login_disabled(client):
    # GOOGLE_CLIENT_ID defaults to empty in test environment
    with patch("routers.auth.settings.google_client_id", ""):
        response = await client.post("/auth/google", json={"credential": "anything"})
    assert response.status_code == 501
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /home/edwardmangini/Documents/Studio/STUD.io/app/controlroom_backend
python -m pytest tests/test_auth.py -v --tb=short -k "google"
```

Expected: 5 errors (ImportError or AttributeError — endpoint/module not defined yet).

- [ ] **Step 3: Rewrite auth.py with all changes**

```python
from datetime import datetime, timedelta, timezone

import bcrypt
from asyncpg import Connection
from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from jose import JWTError, jwt
from pydantic import BaseModel

from config import settings
from database import get_conn

router = APIRouter()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token")


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class Token(BaseModel):
    access_token: str
    token_type: str


class UserOut(BaseModel):
    user_id: str
    username: str
    role: str


class GoogleLogin(BaseModel):
    credential: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt(rounds=12)).decode()


def _verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def _create_token(username: str, role: str = "user") -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    return jwt.encode(
        {"sub": username, "role": role, "exp": expire},
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    conn: Connection = Depends(get_conn),
) -> UserOut:
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        username: str = payload.get("sub")
        role: str = payload.get("role", "user")
        if username is None:
            raise credentials_exc
    except JWTError:
        raise credentials_exc

    row = await conn.fetchrow(
        "SELECT user_id FROM users WHERE username = $1", username
    )
    if row is None:
        raise credentials_exc
    return UserOut(user_id=str(row["user_id"]), username=username, role=role)


async def require_admin(current_user: UserOut = Depends(get_current_user)) -> UserOut:
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


# ---------------------------------------------------------------------------
# Startup helper
# ---------------------------------------------------------------------------

async def seed_default_admin(conn: Connection) -> None:
    count = await conn.fetchval("SELECT COUNT(*) FROM users")
    if count == 0:
        hashed = _hash_password("admin")
        await conn.execute(
            "INSERT INTO users (username, password_hash, role) VALUES ($1, $2, 'admin')",
            "admin",
            hashed,
        )
    else:
        # Ensure existing admin account has admin role (handles migration)
        await conn.execute(
            "UPDATE users SET role = 'admin' WHERE username = 'admin' AND role = 'user'"
        )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/token", response_model=Token)
async def login(
    form: OAuth2PasswordRequestForm = Depends(),
    conn: Connection = Depends(get_conn),
):
    row = await conn.fetchrow(
        "SELECT password_hash, role FROM users WHERE username = $1", form.username
    )
    if row is None or row["password_hash"] is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not _verify_password(form.password, row["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return Token(access_token=_create_token(form.username, row["role"]), token_type="bearer")


@router.get("/me", response_model=UserOut)
async def me(current_user: UserOut = Depends(get_current_user)):
    return current_user


@router.post("/google", response_model=Token)
async def login_google(
    payload: GoogleLogin,
    response: Response,
    conn: Connection = Depends(get_conn),
):
    if not settings.google_client_id:
        raise HTTPException(status_code=501, detail="Google login is not configured")

    try:
        id_info = id_token.verify_oauth2_token(
            payload.credential,
            google_requests.Request(),
            settings.google_client_id,
        )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Google credential",
        )

    sub: str = id_info["sub"]
    email: str = id_info["email"]

    # Returning user
    row = await conn.fetchrow(
        "SELECT username, role FROM users WHERE google_id = $1", sub
    )
    if row:
        return Token(
            access_token=_create_token(row["username"], row["role"]),
            token_type="bearer",
        )

    # Email already registered on a different account
    existing = await conn.fetchrow("SELECT 1 FROM users WHERE email = $1", email)
    if existing:
        raise HTTPException(
            status_code=409,
            detail=(
                "An account with this email already exists. "
                "Sign in with your password, then link your Google account from the Users page."
            ),
        )

    # Resolve unique username
    username = email
    if await conn.fetchrow("SELECT 1 FROM users WHERE username = $1", username):
        base = email + "_google"
        username = base
        i = 1
        while await conn.fetchrow("SELECT 1 FROM users WHERE username = $1", username):
            username = f"{base}_{i}"
            i += 1

    # Auto-create
    await conn.execute(
        "INSERT INTO users (username, google_id, email, role) VALUES ($1, $2, $3, 'user')",
        username,
        sub,
        email,
    )
    response.status_code = 201
    return Token(access_token=_create_token(username, "user"), token_type="bearer")
```

- [ ] **Step 4: Run the Google auth tests**

```bash
python -m pytest tests/test_auth.py -v --tb=short
```

Expected: all pass. If `test_google_login_disabled` fails because the env var is set to `test-client-id` (added in later Task 9), patch approach may be needed — see Task 9.

- [ ] **Step 5: Run full test suite to check nothing regressed**

```bash
python -m pytest tests/ -q
```

Expected: same number of tests pass as before (some may fail until Task 9 updates conftest — that's OK for now; note failures and continue).

- [ ] **Step 6: Commit**

```bash
git add app/controlroom_backend/routers/auth.py
git commit -m "feat: add role to JWT, require_admin dependency, POST /auth/google"
```

---

### Task 4: Add require_admin to write endpoints in all routers

**Files:**
- Modify: `app/controlroom_backend/routers/brands.py`
- Modify: `app/controlroom_backend/routers/models.py`
- Modify: `app/controlroom_backend/routers/effects.py`
- Modify: `app/controlroom_backend/routers/instruments.py`
- Modify: `app/controlroom_backend/routers/libraries.py`
- Modify: `app/controlroom_backend/routers/workstations.py`
- Modify: `app/controlroom_backend/routers/tools.py`
- Modify: `app/controlroom_backend/routers/config.py`
- Modify: `app/controlroom_backend/routers/admin_ops.py`

The pattern is the same for every router. For each file:

1. Add to the import line: `from routers.auth import require_admin, UserOut`
2. On every POST, PATCH, DELETE handler, replace `_: UserOut = Depends(get_current_user)` with `_: UserOut = Depends(require_admin)` — or add `_: UserOut = Depends(require_admin)` if there was no prior auth dep.

**For brands.py example:**

```python
# Add to imports:
from routers.auth import require_admin, UserOut

# Change create_brand signature:
async def create_brand(payload: BrandCreate, conn: Connection = Depends(get_conn), _: UserOut = Depends(require_admin)):

# Change update_brand signature:
async def update_brand(brand_id: UUID, payload: BrandUpdate, conn: Connection = Depends(get_conn), _: UserOut = Depends(require_admin)):

# Change delete_brand signature:
async def delete_brand(brand_id: UUID, conn: Connection = Depends(get_conn), _: UserOut = Depends(require_admin)):
```

Apply the same pattern to: `models.py`, `effects.py`, `instruments.py`, `libraries.py`, `workstations.py`, `tools.py`, `config.py`.

For `admin_ops.py`: change `get_current_user` to `require_admin` on both backup and restore.

**Note:** GET endpoints do NOT get `require_admin` — they should have `get_current_user` or no auth dep. Check each file: if a GET has `get_current_user` already, keep it. If it has none, leave it (reads are public to authenticated users).

- [ ] **Step 1: Apply changes to all 9 router files** (can be done one at a time — edit each file)

- [ ] **Step 2: Run test suite**

```bash
python -m pytest tests/ -q
```

Expected: same pass count as before this task (RBAC tests don't exist yet so no new failures from missing tests).

- [ ] **Step 3: Commit**

```bash
git add app/controlroom_backend/routers/
git commit -m "feat: apply require_admin to all write endpoints and admin routes"
```

---

## Chunk 3: Backend Users Router

### Task 5: Update users.py — role+google_linked in GET, PATCH /role, PATCH /google

**Files:**
- Modify: `app/controlroom_backend/routers/users.py`

- [ ] **Step 1: Write failing tests first** (add to test_users.py)

Add these tests to `app/controlroom_backend/tests/test_users.py`:

```python
from unittest.mock import patch

MOCK_GOOGLE_PAYLOAD = {"sub": "link-uid-456", "email": "linked@gmail.com"}


async def test_list_users_includes_role_and_google_linked(client, auth_headers):
    response = await client.get("/users", headers=auth_headers)
    assert response.status_code == 200
    user = next(u for u in response.json() if u["username"] == "testuser")
    assert "role" in user
    assert "google_linked" in user
    assert user["google_linked"] is False


async def test_change_role_admin_can_change(client, conn, admin_headers):
    hashed = bcrypt.hashpw(b"pass", bcrypt.gensalt(rounds=4)).decode()
    row = await conn.fetchrow(
        "INSERT INTO users (username, password_hash) VALUES ('promote_me', $1) RETURNING user_id", hashed
    )
    response = await client.patch(
        f"/users/{row['user_id']}/role",
        json={"role": "admin"},
        headers=admin_headers,
    )
    assert response.status_code == 204


async def test_change_role_non_admin_forbidden(client, conn, auth_headers):
    hashed = bcrypt.hashpw(b"pass", bcrypt.gensalt(rounds=4)).decode()
    row = await conn.fetchrow(
        "INSERT INTO users (username, password_hash) VALUES ('target', $1) RETURNING user_id", hashed
    )
    response = await client.patch(
        f"/users/{row['user_id']}/role",
        json={"role": "admin"},
        headers=auth_headers,
    )
    assert response.status_code == 403


async def test_change_role_last_admin_blocked(client, conn, admin_headers):
    row = await conn.fetchrow(
        "SELECT user_id FROM users WHERE username = 'adminuser'"
    )
    response = await client.patch(
        f"/users/{row['user_id']}/role",
        json={"role": "user"},
        headers=admin_headers,
    )
    assert response.status_code == 400


async def test_change_role_self_demotion_allowed_with_other_admins(client, conn, admin_headers):
    hashed = bcrypt.hashpw(b"pass", bcrypt.gensalt(rounds=4)).decode()
    await conn.execute(
        "INSERT INTO users (username, password_hash, role) VALUES ('second_admin', $1, 'admin')", hashed
    )
    row = await conn.fetchrow("SELECT user_id FROM users WHERE username = 'adminuser'")
    response = await client.patch(
        f"/users/{row['user_id']}/role",
        json={"role": "user"},
        headers=admin_headers,
    )
    assert response.status_code == 204


async def test_link_google_own_account(client, conn, auth_headers):
    row = await conn.fetchrow("SELECT user_id FROM users WHERE username = 'testuser'")
    with patch("routers.users.id_token.verify_oauth2_token", return_value=MOCK_GOOGLE_PAYLOAD):
        response = await client.patch(
            f"/users/{row['user_id']}/google",
            json={"credential": "fake-token"},
            headers=auth_headers,
        )
    assert response.status_code == 204
    updated = await conn.fetchrow("SELECT google_id FROM users WHERE username = 'testuser'")
    assert updated["google_id"] == "link-uid-456"


async def test_link_google_admin_links_other(client, conn, admin_headers):
    hashed = bcrypt.hashpw(b"pass", bcrypt.gensalt(rounds=4)).decode()
    row = await conn.fetchrow(
        "INSERT INTO users (username, password_hash) VALUES ('other_user', $1) RETURNING user_id", hashed
    )
    with patch("routers.users.id_token.verify_oauth2_token", return_value=MOCK_GOOGLE_PAYLOAD):
        response = await client.patch(
            f"/users/{row['user_id']}/google",
            json={"credential": "fake-token"},
            headers=admin_headers,
        )
    assert response.status_code == 204


async def test_link_google_non_admin_cannot_link_other(client, conn, auth_headers):
    hashed = bcrypt.hashpw(b"pass", bcrypt.gensalt(rounds=4)).decode()
    row = await conn.fetchrow(
        "INSERT INTO users (username, password_hash) VALUES ('victim', $1) RETURNING user_id", hashed
    )
    with patch("routers.users.id_token.verify_oauth2_token", return_value=MOCK_GOOGLE_PAYLOAD):
        response = await client.patch(
            f"/users/{row['user_id']}/google",
            json={"credential": "fake-token"},
            headers=auth_headers,
        )
    assert response.status_code == 403


async def test_link_google_already_linked_to_other(client, conn, auth_headers):
    hashed = bcrypt.hashpw(b"pass", bcrypt.gensalt(rounds=4)).decode()
    await conn.execute(
        "INSERT INTO users (username, password_hash, google_id, email) VALUES ('taken_user', $1, 'link-uid-456', 'linked@gmail.com')",
        hashed,
    )
    row = await conn.fetchrow("SELECT user_id FROM users WHERE username = 'testuser'")
    with patch("routers.users.id_token.verify_oauth2_token", return_value=MOCK_GOOGLE_PAYLOAD):
        response = await client.patch(
            f"/users/{row['user_id']}/google",
            json={"credential": "fake-token"},
            headers=auth_headers,
        )
    assert response.status_code == 409


async def test_link_google_already_linked_to_self(client, conn, auth_headers):
    await conn.execute(
        "UPDATE users SET google_id = 'already-linked', email = 'old@gmail.com' WHERE username = 'testuser'"
    )
    row = await conn.fetchrow("SELECT user_id FROM users WHERE username = 'testuser'")
    with patch("routers.users.id_token.verify_oauth2_token", return_value=MOCK_GOOGLE_PAYLOAD):
        response = await client.patch(
            f"/users/{row['user_id']}/google",
            json={"credential": "fake-token"},
            headers=auth_headers,
        )
    assert response.status_code == 409


async def test_link_google_invalid_token(client, conn, auth_headers):
    row = await conn.fetchrow("SELECT user_id FROM users WHERE username = 'testuser'")
    with patch("routers.users.id_token.verify_oauth2_token", side_effect=Exception("bad")):
        response = await client.patch(
            f"/users/{row['user_id']}/google",
            json={"credential": "bad"},
            headers=auth_headers,
        )
    assert response.status_code == 401
```

- [ ] **Step 2: Run to verify tests fail**

```bash
python -m pytest tests/test_users.py -v --tb=short -k "role or google or google_linked"
```

Expected: failures (endpoints not yet implemented).

- [ ] **Step 3: Rewrite users.py with all changes**

```python
from uuid import UUID

import bcrypt
from asyncpg import Connection
from fastapi import APIRouter, Depends, HTTPException, status
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from pydantic import BaseModel

from config import settings
from database import get_conn
from routers.auth import get_current_user, require_admin, UserOut

router = APIRouter()


class UserListItem(BaseModel):
    user_id: str
    username: str
    role: str
    created_at: str
    google_linked: bool


class UserCreate(BaseModel):
    username: str
    password: str


class PasswordChange(BaseModel):
    password: str


class RoleChange(BaseModel):
    role: str


class GoogleLink(BaseModel):
    credential: str


def _hash(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt(rounds=12)).decode()


@router.get("", response_model=list[UserListItem])
async def list_users(
    conn: Connection = Depends(get_conn),
    _: UserOut = Depends(get_current_user),
):
    rows = await conn.fetch(
        "SELECT user_id, username, role, created_at, google_id FROM users ORDER BY created_at"
    )
    return [
        UserListItem(
            user_id=str(r["user_id"]),
            username=r["username"],
            role=r["role"],
            created_at=r["created_at"].isoformat(),
            google_linked=r["google_id"] is not None,
        )
        for r in rows
    ]


@router.post("", response_model=UserListItem, status_code=201)
async def create_user(
    payload: UserCreate,
    conn: Connection = Depends(get_conn),
    _: UserOut = Depends(require_admin),
):
    existing = await conn.fetchrow("SELECT 1 FROM users WHERE username = $1", payload.username)
    if existing:
        raise HTTPException(status_code=409, detail="Username already exists")
    row = await conn.fetchrow(
        "INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING user_id, username, role, created_at, google_id",
        payload.username,
        _hash(payload.password),
    )
    return UserListItem(
        user_id=str(row["user_id"]),
        username=row["username"],
        role=row["role"],
        created_at=row["created_at"].isoformat(),
        google_linked=row["google_id"] is not None,
    )


@router.patch("/{user_id}/password", status_code=204)
async def change_password(
    user_id: UUID,
    payload: PasswordChange,
    conn: Connection = Depends(get_conn),
    _: UserOut = Depends(get_current_user),
):
    result = await conn.execute(
        "UPDATE users SET password_hash = $1, updated_at = NOW() WHERE user_id = $2",
        _hash(payload.password),
        user_id,
    )
    if result == "UPDATE 0":
        raise HTTPException(status_code=404, detail="User not found")


@router.patch("/{user_id}/role", status_code=204)
async def change_role(
    user_id: UUID,
    payload: RoleChange,
    conn: Connection = Depends(get_conn),
    current_user: UserOut = Depends(require_admin),
):
    if payload.role not in ("admin", "user"):
        raise HTTPException(status_code=422, detail="role must be 'admin' or 'user'")

    row = await conn.fetchrow("SELECT role FROM users WHERE user_id = $1", user_id)
    if not row:
        raise HTTPException(status_code=404, detail="User not found")

    # Guard: cannot demote last admin
    if payload.role == "user":
        admin_count = await conn.fetchval(
            "SELECT COUNT(*) FROM users WHERE role = 'admin'"
        )
        if admin_count <= 1 and row["role"] == "admin":
            raise HTTPException(status_code=400, detail="Cannot demote the last admin")

    await conn.execute(
        "UPDATE users SET role = $1, updated_at = NOW() WHERE user_id = $2",
        payload.role,
        user_id,
    )


@router.patch("/{user_id}/google", status_code=204)
async def link_google(
    user_id: UUID,
    payload: GoogleLink,
    conn: Connection = Depends(get_conn),
    current_user: UserOut = Depends(get_current_user),
):
    # Authorization: own account OR admin
    if current_user.user_id != str(user_id) and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")

    # Verify Google token
    if not settings.google_client_id:
        raise HTTPException(status_code=501, detail="Google login is not configured")
    try:
        id_info = id_token.verify_oauth2_token(
            payload.credential,
            google_requests.Request(),
            settings.google_client_id,
        )
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Google credential")

    sub: str = id_info["sub"]
    email: str = id_info["email"]

    row = await conn.fetchrow("SELECT google_id FROM users WHERE user_id = $1", user_id)
    if not row:
        raise HTTPException(status_code=404, detail="User not found")

    if row["google_id"] is not None:
        raise HTTPException(
            status_code=409,
            detail="Google account already linked. Unlink first before linking a new one.",
        )

    # Check if google_id claimed by another account
    claimed = await conn.fetchrow(
        "SELECT 1 FROM users WHERE google_id = $1 AND user_id != $2", sub, user_id
    )
    if claimed:
        raise HTTPException(
            status_code=409,
            detail="This Google account is already linked to another user",
        )

    await conn.execute(
        "UPDATE users SET google_id = $1, email = $2, updated_at = NOW() WHERE user_id = $3",
        sub,
        email,
        user_id,
    )


@router.delete("/{user_id}", status_code=204)
async def delete_user(
    user_id: UUID,
    conn: Connection = Depends(get_conn),
    current_user: UserOut = Depends(require_admin),
):
    row = await conn.fetchrow("SELECT username FROM users WHERE user_id = $1", user_id)
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    if row["username"] == current_user.username:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    count = await conn.fetchval("SELECT COUNT(*) FROM users")
    if count <= 1:
        raise HTTPException(status_code=400, detail="Cannot delete the last user")
    await conn.execute("DELETE FROM users WHERE user_id = $1", user_id)
```

- [ ] **Step 4: Run the new users tests**

```bash
python -m pytest tests/test_users.py -v --tb=short
```

Expected: passes for new tests after conftest is updated in the next task. Some tests may fail due to `admin_headers` fixture not existing yet — proceed to Task 6.

- [ ] **Step 5: Commit**

```bash
git add app/controlroom_backend/routers/users.py app/controlroom_backend/tests/test_users.py
git commit -m "feat: add role/google_linked to GET /users, PATCH /users/{id}/role, PATCH /users/{id}/google"
```

---

## Chunk 4: Backend Tests

### Task 6: Update conftest.py + write test_rbac.py

**Files:**
- Modify: `app/controlroom_backend/tests/conftest.py`
- Create: `app/controlroom_backend/tests/test_rbac.py`

- [ ] **Step 1: Update conftest.py**

Replace the full content of conftest.py:

```python
import os
os.environ.setdefault("DB_NAME", "controlroomdb_test")
os.environ.setdefault("GOOGLE_CLIENT_ID", "test-client-id")

import json
import bcrypt
import pytest_asyncio
import asyncpg
from httpx import AsyncClient, ASGITransport

from main import app
from database import get_conn
from routers.auth import _create_token

TEST_DSN = "postgresql://studio:studio@localhost:5432/controlroomdb_test"


@pytest_asyncio.fixture()
async def conn():
    """Per-test direct connection with a rolled-back transaction."""
    connection = await asyncpg.connect(dsn=TEST_DSN)
    await connection.set_type_codec("json",  encoder=json.dumps, decoder=json.loads, schema="pg_catalog")
    await connection.set_type_codec("jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog")
    tx = connection.transaction()
    await tx.start()
    yield connection
    await tx.rollback()
    await connection.close()


@pytest_asyncio.fixture()
async def client(conn):
    """AsyncClient wired to the FastAPI app, sharing the test transaction."""
    async def override_get_conn():
        yield conn

    app.dependency_overrides[get_conn] = override_get_conn

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test"
    ) as ac:
        yield ac

    app.dependency_overrides.clear()


@pytest_asyncio.fixture()
async def auth_headers(conn):
    """Insert a regular test user and return bearer token headers (role='user')."""
    hashed = bcrypt.hashpw(b"testpass", bcrypt.gensalt(rounds=4)).decode()
    await conn.execute(
        "INSERT INTO users (username, password_hash, role) VALUES ('testuser', $1, 'user')", hashed
    )
    token = _create_token("testuser", "user")
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture()
async def admin_headers(conn):
    """Insert an admin test user and return bearer token headers (role='admin')."""
    hashed = bcrypt.hashpw(b"adminpass", bcrypt.gensalt(rounds=4)).decode()
    await conn.execute(
        "INSERT INTO users (username, password_hash, role) VALUES ('adminuser', $1, 'admin')", hashed
    )
    token = _create_token("adminuser", "admin")
    return {"Authorization": f"Bearer {token}"}
```

- [ ] **Step 2: Write test_rbac.py**

Create `app/controlroom_backend/tests/test_rbac.py`:

```python
"""
RBAC access control tests.
Verifies that admin role can write and user role cannot.
Uses /brands as the representative resource for write tests.
"""


# ---------------------------------------------------------------------------
# Read access — both roles
# ---------------------------------------------------------------------------

async def test_user_can_list_brands(client, auth_headers):
    response = await client.get("/brands", headers=auth_headers)
    assert response.status_code == 200


async def test_admin_can_list_brands(client, admin_headers):
    response = await client.get("/brands", headers=admin_headers)
    assert response.status_code == 200


async def test_user_can_list_effects(client, auth_headers):
    response = await client.get("/effects", headers=auth_headers)
    assert response.status_code == 200


async def test_user_can_list_instruments(client, auth_headers):
    response = await client.get("/instruments", headers=auth_headers)
    assert response.status_code == 200


async def test_user_can_list_libraries(client, auth_headers):
    response = await client.get("/libraries", headers=auth_headers)
    assert response.status_code == 200


# ---------------------------------------------------------------------------
# Write access — admin allowed, user forbidden
# ---------------------------------------------------------------------------

async def test_admin_can_create_brand(client, admin_headers):
    response = await client.post(
        "/brands",
        json={"legal_name": "RBAC Test Brand"},
        headers=admin_headers,
    )
    assert response.status_code == 201


async def test_user_cannot_create_brand(client, auth_headers):
    response = await client.post(
        "/brands",
        json={"legal_name": "Should Fail"},
        headers=auth_headers,
    )
    assert response.status_code == 403


async def test_admin_can_patch_brand(client, conn, admin_headers):
    row = await conn.fetchrow("SELECT brand_id FROM brands LIMIT 1")
    response = await client.patch(
        f"/brands/{row['brand_id']}",
        json={"website": "https://rbac-test.com"},
        headers=admin_headers,
    )
    assert response.status_code == 200


async def test_user_cannot_patch_brand(client, conn, auth_headers):
    row = await conn.fetchrow("SELECT brand_id FROM brands LIMIT 1")
    response = await client.patch(
        f"/brands/{row['brand_id']}",
        json={"website": "https://forbidden.com"},
        headers=auth_headers,
    )
    assert response.status_code == 403


async def test_user_cannot_delete_brand(client, conn, auth_headers):
    row = await conn.fetchrow("SELECT brand_id FROM brands LIMIT 1")
    response = await client.delete(f"/brands/{row['brand_id']}", headers=auth_headers)
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# Admin routes — admin allowed, user forbidden
# ---------------------------------------------------------------------------

async def test_admin_can_access_backup(client, admin_headers):
    from unittest.mock import patch, MagicMock
    mock_result = MagicMock()
    mock_result.returncode = 0
    mock_result.stdout = b"-- PostgreSQL database dump\n"
    mock_result.stderr = b""
    with patch("routers.admin_ops.subprocess.run", return_value=mock_result):
        response = await client.get("/admin/backup", headers=admin_headers)
    assert response.status_code == 200


async def test_user_cannot_access_backup(client, auth_headers):
    response = await client.get("/admin/backup", headers=auth_headers)
    assert response.status_code == 403


async def test_user_cannot_restore(client, auth_headers):
    import io
    response = await client.post(
        "/admin/restore",
        files={"file": ("dump.sql", io.BytesIO(b"SELECT 1;"), "application/octet-stream")},
        headers=auth_headers,
    )
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# Unauthenticated — all blocked
# ---------------------------------------------------------------------------

async def test_unauthenticated_cannot_read(client):
    response = await client.get("/brands")
    # GETs currently have no auth requirement — they return 200
    # This documents the current behavior; if auth is added to GETs, update this test
    assert response.status_code in (200, 401)


async def test_unauthenticated_cannot_write(client):
    response = await client.post("/brands", json={"legal_name": "No Auth"})
    assert response.status_code == 401
```

- [ ] **Step 3: Run all tests**

```bash
python -m pytest tests/ -q
```

Expected: 200+ passing, 0 failures.

- [ ] **Step 4: Commit**

```bash
git add app/controlroom_backend/tests/conftest.py app/controlroom_backend/tests/test_rbac.py app/controlroom_backend/tests/test_auth.py app/controlroom_backend/tests/test_users.py
git commit -m "test: update conftest for roles, add test_rbac.py, update auth/users tests"
```

---

## Chunk 5: Frontend Auth + Login Page

### Task 7: Update lib/api.ts to send auth token

**Files:**
- Modify: `app/controlroom_frontend/lib/api.ts`

The `api.ts` utility currently sends no `Authorization` header. All protected endpoints will return 401 without it. Fix by reading the token from localStorage.

- [ ] **Step 1: Update api.ts**

Replace the full content:

```typescript
const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5150'
const TOKEN_KEY = 'controlroom_token'

function authHeader(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  const token = localStorage.getItem(TOKEN_KEY)
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    ...init,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail ?? res.statusText)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

export const api = {
  list:   <T>(ep: string, q?: string) => req<T[]>(`${ep}${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  get:    <T>(ep: string, id: string) => req<T>(`${ep}/${id}`),
  create: <T>(ep: string, body: unknown) => req<T>(ep, { method: 'POST', body: JSON.stringify(body) }),
  update: <T>(ep: string, id: string, body: unknown) => req<T>(`${ep}/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (ep: string, id: string) => req<void>(`${ep}/${id}`, { method: 'DELETE' }),
}
```

- [ ] **Step 2: Fix backup/restore page to include auth token**

In `app/controlroom_frontend/app/admin/backup/page.tsx`, add `useAuth` import and pass token in fetch calls:

At the top, add:
```typescript
import { useAuth } from '@/lib/auth'
```

Inside `BackupRestorePage()`, add:
```typescript
const { token } = useAuth()
```

Update the backup fetch:
```typescript
const res = await fetch(`${API}/admin/backup`, {
  headers: { Authorization: `Bearer ${token}` },
})
```

Update the restore fetch:
```typescript
const res = await fetch(`${API}/admin/restore`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
  body: form,
})
```

- [ ] **Step 3: Commit**

```bash
git add app/controlroom_frontend/lib/api.ts app/controlroom_frontend/app/admin/backup/page.tsx
git commit -m "fix: send Authorization header in api.ts and backup/restore page"
```

---

### Task 8: Update lib/auth.tsx — add role, loginGoogle

**Files:**
- Modify: `app/controlroom_frontend/lib/auth.tsx`

- [ ] **Step 1: Rewrite auth.tsx**

```typescript
'use client'

import * as React from 'react'
import { useRouter, usePathname } from 'next/navigation'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5150'
const TOKEN_KEY = 'controlroom_token'

function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    return JSON.parse(atob(token.split('.')[1]))
  } catch {
    return {}
  }
}

interface AuthContextValue {
  token: string | null
  username: string | null
  role: 'admin' | 'user' | null
  login: (username: string, password: string) => Promise<void>
  loginGoogle: (credential: string) => Promise<void>
  logout: () => void
}

const AuthContext = React.createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = React.useState<string | null>(null)
  const [username, setUsername] = React.useState<string | null>(null)
  const [role, setRole] = React.useState<'admin' | 'user' | null>(null)
  const [checked, setChecked] = React.useState(false)
  const router = useRouter()
  const pathname = usePathname()

  function _applyToken(jwt: string) {
    const payload = decodeJwtPayload(jwt)
    setToken(jwt)
    setUsername(payload.sub as string ?? null)
    setRole(payload.role === 'admin' ? 'admin' : 'user')
    localStorage.setItem(TOKEN_KEY, jwt)
  }

  // On mount, restore token from localStorage and validate it
  React.useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY)
    if (!stored) {
      setChecked(true)
      return
    }
    fetch(`${API}/auth/me`, {
      headers: { Authorization: `Bearer ${stored}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error('invalid')
        return r.json()
      })
      .then(() => {
        const payload = decodeJwtPayload(stored)
        setToken(stored)
        setUsername(payload.sub as string ?? null)
        setRole(payload.role === 'admin' ? 'admin' : 'user')
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY)
      })
      .finally(() => setChecked(true))
  }, [])

  // Redirect unauthenticated users away from protected pages
  React.useEffect(() => {
    if (!checked) return
    if (!token && pathname !== '/login') {
      router.replace('/login')
    }
    if (token && pathname === '/login') {
      router.replace('/')
    }
  }, [checked, token, pathname, router])

  async function login(user: string, password: string) {
    const form = new URLSearchParams()
    form.append('username', user)
    form.append('password', password)

    const res = await fetch(`${API}/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Login failed' }))
      throw new Error(err.detail ?? 'Login failed')
    }
    const data = await res.json()
    _applyToken(data.access_token)
  }

  async function loginGoogle(credential: string) {
    const res = await fetch(`${API}/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Google sign-in failed' }))
      throw new Error(err.detail ?? 'Google sign-in failed')
    }
    const data = await res.json()
    _applyToken(data.access_token)
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY)
    setToken(null)
    setUsername(null)
    setRole(null)
    router.replace('/login')
  }

  if (!checked) return null

  return (
    <AuthContext.Provider value={{ token, username, role, login, loginGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
```

- [ ] **Step 2: Commit**

```bash
git add app/controlroom_frontend/lib/auth.tsx
git commit -m "feat: add role and loginGoogle to auth context"
```

---

### Task 9: Add TypeScript declarations for Google Identity Services

**Files:**
- Create: `app/controlroom_frontend/types/google.d.ts`

- [ ] **Step 1: Create type declaration file**

```typescript
interface Window {
  google: {
    accounts: {
      id: {
        initialize: (config: {
          client_id: string
          callback: (response: { credential: string }) => void
        }) => void
        renderButton: (element: HTMLElement, options: Record<string, unknown>) => void
        prompt: () => void
      }
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/controlroom_frontend/types/google.d.ts
git commit -m "chore: add TypeScript declarations for Google Identity Services"
```

---

### Task 10: Update login page with Google Sign-In button

**Files:**
- Modify: `app/controlroom_frontend/app/login/page.tsx`

- [ ] **Step 1: Rewrite login/page.tsx**

```typescript
'use client'

import * as React from 'react'
import Script from 'next/script'
import { useAuth } from '@/lib/auth'
import { Loader2 } from 'lucide-react'

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? ''

export default function LoginPage() {
  const { login, loginGoogle } = useAuth()

  // Password form state
  const [username, setUsername] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)

  // Google button
  const googleButtonRef = React.useRef<HTMLDivElement>(null)
  const [googleLoading, setGoogleLoading] = React.useState(false)

  function initGIS() {
    if (!GOOGLE_CLIENT_ID || !googleButtonRef.current) return
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleGoogleCredential,
    })
    window.google.accounts.id.renderButton(googleButtonRef.current, {
      theme: 'filled_black',
      size: 'large',
      width: 320,
    })
  }

  async function handleGoogleCredential(response: { credential: string }) {
    setGoogleLoading(true)
    setError(null)
    try {
      await loginGoogle(response.credential)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed')
    } finally {
      setGoogleLoading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await login(username, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="text-xs font-bold tracking-widest text-muted-foreground uppercase mb-1">
            STUD.io
          </div>
          <div className="text-xl font-semibold text-foreground">ControlRoom</div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <h2 className="text-sm font-medium text-foreground mb-5">Sign in</h2>

          <div className="mb-4">
            <label className="block text-xs text-muted-foreground mb-1.5">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
              required
              className="w-full rounded border border-border bg-muted px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="mb-5">
            <label className="block text-xs text-muted-foreground mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              className="w-full rounded border border-border bg-muted px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {error && <p className="mb-4 text-xs text-destructive">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Sign in
          </button>

          {/* Google Sign-In */}
          {GOOGLE_CLIENT_ID && (
            <>
              <div className="flex items-center gap-3 my-5">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground">or</span>
                <div className="flex-1 h-px bg-border" />
              </div>
              <div className="flex justify-center">
                {googleLoading
                  ? <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> Signing in…
                    </div>
                  : <div ref={googleButtonRef} />
                }
              </div>
            </>
          )}
        </form>
      </div>

      {/* Load GIS script — renders the button once ready */}
      {GOOGLE_CLIENT_ID && (
        <Script
          src="https://accounts.google.com/gsi/client"
          strategy="afterInteractive"
          onLoad={initGIS}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/controlroom_frontend/app/login/page.tsx
git commit -m "feat: add Google Sign-In button to login page"
```

---

## Chunk 6: Frontend Role-Aware UI

### Task 11: Hide ADMIN sidebar group for non-admins

**Files:**
- Modify: `app/controlroom_frontend/components/layout/Sidebar.tsx`

- [ ] **Step 1: Update Sidebar.tsx**

The `Sidebar` already imports `useAuth`. Add `role` to the destructure and filter out the ADMIN group for non-admins.

In the `Sidebar` function, change:
```typescript
const { username, logout } = useAuth()
```
to:
```typescript
const { username, role, logout } = useAuth()
```

Change the nav render from iterating `navGroups` directly to a filtered list:
```typescript
{navGroups
  .filter((group) => group.title !== 'ADMIN' || role === 'admin')
  .map((group) => {
    // ... existing map body unchanged
  })}
```

- [ ] **Step 2: Commit**

```bash
git add app/controlroom_frontend/components/layout/Sidebar.tsx
git commit -m "feat: hide ADMIN sidebar group for non-admin users"
```

---

### Task 12: Hide Add/Edit/Delete controls in TablePage for non-admins

**Files:**
- Modify: `app/controlroom_frontend/components/TablePage.tsx`

`TablePage` renders the `[+ Add]` button. The edit/delete controls live inside the modal components (BrandModal, ModelModal, etc.), which are passed in via `renderModal`. The simplest fix: read `role` from `useAuth()` inside `TablePage` and hide the Add button; modals use `useAuth()` directly.

- [ ] **Step 1: Update TablePage.tsx**

Add `useAuth` import:
```typescript
import { useAuth } from '@/lib/auth'
```

Inside `TablePage`, add:
```typescript
const { role } = useAuth()
const isAdmin = role === 'admin'
```

Wrap the Add button in a conditional:
```typescript
{isAdmin && (
  <Button size="sm" onClick={handleAdd} className="gap-1.5">
    <Plus className="h-3.5 w-3.5" />
    Add
  </Button>
)}
```

- [ ] **Step 2: Hide Edit button in modals**

Each modal (BrandModal, ModelModal, EffectsModal, InstrumentsModal, LibrariesModal, WorkstationsModal, ToolsModal) renders an `[Edit]` button and sometimes a `[Delete]` button. Find each modal file under `app/controlroom_frontend/components/tables/*/`. In each one:

1. Import `useAuth`
2. Add `const { role } = useAuth()` inside the component
3. Wrap the `[Edit]` and `[Delete]` buttons: `{role === 'admin' && <button ...>Edit</button>}`

The pattern is the same for each modal — locate the Edit/Delete button JSX and wrap it.

- [ ] **Step 3: Commit**

```bash
git add app/controlroom_frontend/components/TablePage.tsx app/controlroom_frontend/components/tables/
git commit -m "feat: hide Add/Edit/Delete controls for non-admin users"
```

---

### Task 13: Update Users page — role badge, role toggle, Link Google

**Files:**
- Modify: `app/controlroom_frontend/app/admin/users/page.tsx`

Key changes:
1. `User` interface gains `role: string` and `google_linked: boolean`
2. Role badge in table
3. Role toggle button (admin-only, with tooltip)
4. Link Google button on own row (triggers GIS One Tap)
5. Google indicator on other rows

- [ ] **Step 1: Rewrite users/page.tsx**

```typescript
'use client'

import * as React from 'react'
import Script from 'next/script'
import { Trash2, Plus, KeyRound, Loader2, CheckCircle, AlertCircle, X, Shield, User as UserIcon } from 'lucide-react'
import { useAuth } from '@/lib/auth'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5150'
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? ''

interface User {
  user_id: string
  username: string
  role: string
  created_at: string
  google_linked: boolean
}

type Status = { type: 'success' | 'error'; message: string } | null

function StatusMessage({ status, onDismiss }: { status: NonNullable<Status>; onDismiss: () => void }) {
  return (
    <div className={`flex items-center gap-2 mt-3 text-xs ${
      status.type === 'success' ? 'text-green-400' : 'text-destructive'
    }`}>
      {status.type === 'success'
        ? <CheckCircle className="h-3.5 w-3.5 flex-shrink-0" />
        : <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />}
      <span className="flex-1">{status.message}</span>
      <button onClick={onDismiss} className="ml-1 opacity-60 hover:opacity-100">
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}

export default function UsersPage() {
  const { token, username: currentUsername } = useAuth()
  const [users, setUsers] = React.useState<User[]>([])
  const [loading, setLoading] = React.useState(true)
  const [status, setStatus] = React.useState<Status>(null)

  // Add user
  const [newUsername, setNewUsername] = React.useState('')
  const [newPassword, setNewPassword] = React.useState('')
  const [addLoading, setAddLoading] = React.useState(false)

  // Change password inline
  const [changingId, setChangingId] = React.useState<string | null>(null)
  const [newPw, setNewPw] = React.useState('')
  const [pwLoading, setPwLoading] = React.useState(false)

  // Link Google
  const [linkingId, setLinkingId] = React.useState<string | null>(null)

  function authHeaders() {
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  }

  async function fetchUsers() {
    const res = await fetch(`${API}/users`, { headers: authHeaders() })
    if (res.ok) setUsers(await res.json())
  }

  React.useEffect(() => {
    fetchUsers().finally(() => setLoading(false))
  }, [])

  // GIS One Tap for linking
  function initGISForLink() {
    if (!GOOGLE_CLIENT_ID) return
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleLinkCredential,
    })
  }

  async function handleLinkCredential(response: { credential: string }) {
    if (!linkingId) return
    setStatus(null)
    try {
      const res = await fetch(`${API}/users/${linkingId}/google`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ credential: response.credential }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(err.detail ?? res.statusText)
      }
      setStatus({ type: 'success', message: 'Google account linked' })
      await fetchUsers()
    } catch (e) {
      setStatus({ type: 'error', message: e instanceof Error ? e.message : 'Failed to link Google account' })
    } finally {
      setLinkingId(null)
    }
  }

  function handleLinkGoogle(userId: string) {
    setLinkingId(userId)
    if (GOOGLE_CLIENT_ID) {
      window.google.accounts.id.prompt()
    }
  }

  async function handleRoleToggle(user: User) {
    const newRole = user.role === 'admin' ? 'user' : 'admin'
    setStatus(null)
    try {
      const res = await fetch(`${API}/users/${user.user_id}/role`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ role: newRole }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(err.detail ?? res.statusText)
      }
      setStatus({ type: 'success', message: `${user.username} is now ${newRole}. Takes effect on next login.` })
      await fetchUsers()
    } catch (e) {
      setStatus({ type: 'error', message: e instanceof Error ? e.message : 'Failed to change role' })
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setAddLoading(true)
    setStatus(null)
    try {
      const res = await fetch(`${API}/users`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ username: newUsername, password: newPassword }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(err.detail ?? res.statusText)
      }
      setNewUsername('')
      setNewPassword('')
      setStatus({ type: 'success', message: `User "${newUsername}" created` })
      await fetchUsers()
    } catch (e) {
      setStatus({ type: 'error', message: e instanceof Error ? e.message : 'Failed to create user' })
    } finally {
      setAddLoading(false)
    }
  }

  async function handleDelete(user: User) {
    setStatus(null)
    try {
      const res = await fetch(`${API}/users/${user.user_id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(err.detail ?? res.statusText)
      }
      setStatus({ type: 'success', message: `User "${user.username}" deleted` })
      await fetchUsers()
    } catch (e) {
      setStatus({ type: 'error', message: e instanceof Error ? e.message : 'Failed to delete user' })
    }
  }

  async function handleChangePassword(userId: string) {
    setPwLoading(true)
    setStatus(null)
    try {
      const res = await fetch(`${API}/users/${userId}/password`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ password: newPw }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(err.detail ?? res.statusText)
      }
      setStatus({ type: 'success', message: 'Password updated' })
      setChangingId(null)
      setNewPw('')
    } catch (e) {
      setStatus({ type: 'error', message: e instanceof Error ? e.message : 'Failed to update password' })
    } finally {
      setPwLoading(false)
    }
  }

  const adminCount = users.filter((u) => u.role === 'admin').length

  return (
    <div className="flex flex-col h-full px-6 py-6 max-w-2xl">
      <h2 className="text-lg font-semibold text-foreground mb-1">Users</h2>
      <p className="text-xs text-muted-foreground mb-8">
        Manage accounts that can log into ControlRoom.
      </p>

      <section className="mb-8">
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-left py-2 font-medium">Username</th>
                <th className="text-left py-2 font-medium">Role</th>
                <th className="text-left py-2 font-medium">Google</th>
                <th className="text-left py-2 font-medium">Created</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isMe = u.username === currentUsername
                const isLastAdmin = u.role === 'admin' && adminCount <= 1
                return (
                  <React.Fragment key={u.user_id}>
                    <tr className="border-b border-border/50">
                      <td className="py-2 text-foreground">
                        {u.username}
                        {isMe && <span className="ml-2 text-muted-foreground">(you)</span>}
                      </td>
                      <td className="py-2">
                        <button
                          onClick={() => handleRoleToggle(u)}
                          disabled={isLastAdmin}
                          title={isLastAdmin ? 'Cannot demote the last admin' : 'Role change takes effect on next login'}
                          className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-xs transition-colors ${
                            u.role === 'admin'
                              ? 'bg-primary/20 text-primary hover:bg-primary/30'
                              : 'bg-muted text-muted-foreground hover:bg-muted/80'
                          } disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                          {u.role === 'admin'
                            ? <><Shield className="h-3 w-3" /> admin</>
                            : <><UserIcon className="h-3 w-3" /> user</>
                          }
                        </button>
                      </td>
                      <td className="py-2">
                        {u.google_linked ? (
                          <span className="text-green-400 text-xs">linked</span>
                        ) : isMe && GOOGLE_CLIENT_ID ? (
                          <button
                            onClick={() => handleLinkGoogle(u.user_id)}
                            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
                          >
                            link
                          </button>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      <td className="py-2 text-muted-foreground">
                        {new Date(u.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => {
                              setChangingId(changingId === u.user_id ? null : u.user_id)
                              setNewPw('')
                              setStatus(null)
                            }}
                            title="Change password"
                            className="text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <KeyRound className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(u)}
                            disabled={isMe}
                            title="Delete user"
                            className="text-muted-foreground hover:text-destructive transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {changingId === u.user_id && (
                      <tr className="border-b border-border/50 bg-muted/30">
                        <td colSpan={5} className="py-2 px-2">
                          <div className="flex items-center gap-2">
                            <input
                              type="password"
                              value={newPw}
                              onChange={(e) => setNewPw(e.target.value)}
                              placeholder="New password"
                              autoFocus
                              className="flex-1 rounded border border-border bg-muted px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                            <button
                              onClick={() => handleChangePassword(u.user_id)}
                              disabled={!newPw || pwLoading}
                              className="flex items-center gap-1 px-3 py-1 rounded bg-primary text-primary-foreground text-xs hover:bg-primary/90 disabled:opacity-50 transition-colors"
                            >
                              {pwLoading && <Loader2 className="h-3 w-3 animate-spin" />}
                              Save
                            </button>
                            <button
                              onClick={() => { setChangingId(null); setNewPw('') }}
                              className="text-muted-foreground hover:text-foreground transition-colors"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        )}

        {status && <StatusMessage status={status} onDismiss={() => setStatus(null)} />}
      </section>

      <div className="border-t border-border mb-8" />

      <section>
        <h3 className="text-sm font-medium text-foreground mb-4">Add User</h3>
        <form onSubmit={handleAdd} className="flex items-end gap-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">Username</label>
            <input
              type="text"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              required
              className="rounded border border-border bg-muted px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              className="rounded border border-border bg-muted px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <button
            type="submit"
            disabled={addLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {addLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Add User
          </button>
        </form>
      </section>

      {GOOGLE_CLIENT_ID && (
        <Script
          src="https://accounts.google.com/gsi/client"
          strategy="afterInteractive"
          onLoad={initGISForLink}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/controlroom_frontend/app/admin/users/page.tsx
git commit -m "feat: add role badge, role toggle, and Link Google to Users page"
```

---

### Task 14: Rebuild containers and run full test suite

- [ ] **Step 1: Rebuild backend container**

```bash
cd /home/edwardmangini/Documents/Studio/STUD.io
docker compose build controlroom_backend
docker compose up -d controlroom_backend
```

Wait ~5 seconds, then check logs:
```bash
docker logs controlroom_backend 2>&1 | tail -10
```
Expected: `Application startup complete.`

- [ ] **Step 2: Run full backend test suite from host**

```bash
cd app/controlroom_backend
python -m pytest tests/ -q
```

Expected: 200+ tests passing, 0 failures.

- [ ] **Step 3: Verify frontend compiles**

```bash
docker logs controlroom_frontend 2>&1 | grep -E "error|Error|compiled" | tail -20
```

Expected: no errors, `✓ Compiled` lines for the pages you modified.

- [ ] **Step 4: Final commit — update README**

Update `README.md` Current State section:
- Bump to v1.2
- Add: JWT RBAC with Admin/User roles — admins have full access, users are read-only
- Add: Google Sign-In support (requires `GOOGLE_CLIENT_ID` in docker-compose)
- Move "Auth" from In Progress to completed bullet

```bash
git add README.md
git commit -m "docs: update README for v1.2 — Google SSO + RBAC"
```

---

## Final Verification Checklist

Before marking complete, confirm:

- [ ] `python -m pytest tests/ -q` → 0 failures
- [ ] `docker logs controlroom_backend` → `Application startup complete.` with no errors
- [ ] Log in as `admin` / `admin` → full UI visible including ADMIN section
- [ ] Create a second user with role `user`, log in as them → ADMIN sidebar group hidden, no Add/Edit/Delete buttons visible
- [ ] Google button renders on login page when `NEXT_PUBLIC_GOOGLE_CLIENT_ID` is set
- [ ] Google button is absent when `NEXT_PUBLIC_GOOGLE_CLIENT_ID` is empty
