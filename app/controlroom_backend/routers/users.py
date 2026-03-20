from typing import Annotated
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

_NOT_FOUND = "User not found"


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


def _verify_google_credential(credential: str, client_id: str) -> dict[str, str]:
    try:
        id_info = id_token.verify_oauth2_token(
            credential, google_requests.Request(), client_id
        )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Google credential",
        )
    return {"sub": id_info["sub"], "email": id_info["email"]}


async def _check_last_admin(
    conn: Connection, new_role: str, current_role: str
) -> None:
    if new_role == "user" and current_role == "admin":
        admin_count = await conn.fetchval("SELECT COUNT(*) FROM users WHERE role = 'admin'")
        if admin_count <= 1:
            raise HTTPException(status_code=400, detail="Cannot demote the last admin")


async def _check_google_claim(conn: Connection, sub: str, user_id: UUID) -> None:
    claimed = await conn.fetchrow(
        "SELECT 1 FROM users WHERE google_id = $1 AND user_id != $2", sub, user_id
    )
    if claimed:
        raise HTTPException(
            status_code=409,
            detail="This Google account is already linked to another user",
        )


@router.get("", response_model=list[UserListItem])
async def list_users(
    conn: Annotated[Connection, Depends(get_conn)],
    _: Annotated[UserOut, Depends(get_current_user)],
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


@router.post("", response_model=UserListItem, status_code=201, responses={409: {"description": "Conflict"}})
async def create_user(
    payload: UserCreate,
    conn: Annotated[Connection, Depends(get_conn)],
    _: Annotated[UserOut, Depends(require_admin)],
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


@router.patch("/{user_id}/password", status_code=204, responses={404: {"description": "Not found"}})
async def change_password(
    user_id: UUID,
    payload: PasswordChange,
    conn: Annotated[Connection, Depends(get_conn)],
    _: Annotated[UserOut, Depends(get_current_user)],
):
    result = await conn.execute(
        "UPDATE users SET password_hash = $1, updated_at = NOW() WHERE user_id = $2",
        _hash(payload.password),
        user_id,
    )
    if result == "UPDATE 0":
        raise HTTPException(status_code=404, detail=_NOT_FOUND)


@router.patch("/{user_id}/role", status_code=204, responses={400: {"description": "Bad request"}, 404: {"description": "Not found"}, 422: {"description": "Unprocessable entity"}})
async def change_role(
    user_id: UUID,
    payload: RoleChange,
    conn: Annotated[Connection, Depends(get_conn)],
    _: Annotated[UserOut, Depends(require_admin)],
):
    if payload.role not in ("admin", "user"):
        raise HTTPException(status_code=422, detail="role must be 'admin' or 'user'")

    row = await conn.fetchrow("SELECT role FROM users WHERE user_id = $1", user_id)
    if not row:
        raise HTTPException(status_code=404, detail=_NOT_FOUND)

    await _check_last_admin(conn, payload.role, row["role"])
    await conn.execute(
        "UPDATE users SET role = $1, updated_at = NOW() WHERE user_id = $2",
        payload.role,
        user_id,
    )


@router.patch("/{user_id}/google", status_code=204, responses={401: {"description": "Unauthorized"}, 403: {"description": "Forbidden"}, 404: {"description": "Not found"}, 409: {"description": "Conflict"}, 501: {"description": "Not implemented"}})
async def link_google(
    user_id: UUID,
    payload: GoogleLink,
    conn: Annotated[Connection, Depends(get_conn)],
    current_user: Annotated[UserOut, Depends(get_current_user)],
):
    if current_user.user_id != str(user_id) and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")

    if not settings.google_client_id:
        raise HTTPException(status_code=501, detail="Google login is not configured")

    google_info = _verify_google_credential(payload.credential, settings.google_client_id)
    sub: str = google_info["sub"]
    email: str = google_info["email"]

    row = await conn.fetchrow("SELECT google_id FROM users WHERE user_id = $1", user_id)
    if not row:
        raise HTTPException(status_code=404, detail=_NOT_FOUND)

    if row["google_id"] is not None:
        raise HTTPException(
            status_code=409,
            detail="Google account already linked. Unlink first before linking a new one.",
        )

    await _check_google_claim(conn, sub, user_id)
    await conn.execute(
        "UPDATE users SET google_id = $1, email = $2, updated_at = NOW() WHERE user_id = $3",
        sub, email, user_id,
    )


@router.delete("/{user_id}", status_code=204, responses={400: {"description": "Bad request"}, 404: {"description": "Not found"}})
async def delete_user(
    user_id: UUID,
    conn: Annotated[Connection, Depends(get_conn)],
    current_user: Annotated[UserOut, Depends(require_admin)],
):
    row = await conn.fetchrow("SELECT username FROM users WHERE user_id = $1", user_id)
    if not row:
        raise HTTPException(status_code=404, detail=_NOT_FOUND)
    if row["username"] == current_user.username:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    count = await conn.fetchval("SELECT COUNT(*) FROM users")
    if count <= 1:
        raise HTTPException(status_code=400, detail="Cannot delete the last user")
    await conn.execute("DELETE FROM users WHERE user_id = $1", user_id)
