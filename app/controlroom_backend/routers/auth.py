from datetime import datetime, timedelta, timezone
from typing import Annotated

import bcrypt
from asyncpg import Connection
from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
import jwt
from jwt.exceptions import PyJWTError as JWTError
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
    token: Annotated[str, Depends(oauth2_scheme)],
    conn: Annotated[Connection, Depends(get_conn)],
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

    row = await conn.fetchrow("SELECT user_id FROM users WHERE username = $1", username)
    if row is None:
        raise credentials_exc
    return UserOut(user_id=str(row["user_id"]), username=username, role=role)


def require_admin(current_user: Annotated[UserOut, Depends(get_current_user)]) -> UserOut:
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


# ---------------------------------------------------------------------------
# Startup helper — seed default admin if users table is empty
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
        # Upgrade existing admin account to admin role (migration helper)
        await conn.execute(
            "UPDATE users SET role = 'admin' WHERE username = 'admin' AND role = 'user'"
        )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/token", response_model=Token, responses={401: {"description": "Unauthorized"}})
async def login(
    form: Annotated[OAuth2PasswordRequestForm, Depends()],
    conn: Annotated[Connection, Depends(get_conn)],
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
async def me(current_user: Annotated[UserOut, Depends(get_current_user)]):
    return current_user


@router.post("/google", response_model=Token, responses={401: {"description": "Unauthorized"}, 409: {"description": "Conflict"}, 501: {"description": "Not implemented"}})
async def login_google(
    payload: GoogleLogin,
    response: Response,
    conn: Annotated[Connection, Depends(get_conn)],
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

    # Returning user — already linked
    row = await conn.fetchrow(
        "SELECT username, role FROM users WHERE google_id = $1", sub
    )
    if row:
        return Token(
            access_token=_create_token(row["username"], row["role"]),
            token_type="bearer",
        )

    # Email matches an existing account's email column — prompt them to link instead
    existing = await conn.fetchrow("SELECT 1 FROM users WHERE email = $1", email)
    if existing:
        raise HTTPException(
            status_code=409,
            detail=(
                "An account with this email already exists. "
                "Sign in with your password, then link your Google account from the Users page."
            ),
        )

    # Resolve unique username (email → email_google → email_google_1 …)
    username = email
    if await conn.fetchrow("SELECT 1 FROM users WHERE username = $1", username):
        base = email + "_google"
        username = base
        i = 1
        while await conn.fetchrow("SELECT 1 FROM users WHERE username = $1", username):
            username = f"{base}_{i}"
            i += 1

    # Auto-create Google-only account
    await conn.execute(
        "INSERT INTO users (username, google_id, email, role) VALUES ($1, $2, $3, 'user')",
        username, sub, email,
    )
    response.status_code = 201
    return Token(access_token=_create_token(username, "user"), token_type="bearer")
