from uuid import UUID

import bcrypt
from asyncpg import Connection
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from database import get_conn
from routers.auth import get_current_user, UserOut

router = APIRouter()


class UserListItem(BaseModel):
    user_id: str
    username: str
    created_at: str


class UserCreate(BaseModel):
    username: str
    password: str


class PasswordChange(BaseModel):
    password: str


def _hash(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt(rounds=12)).decode()


@router.get("", response_model=list[UserListItem])
async def list_users(
    conn: Connection = Depends(get_conn),
    _: UserOut = Depends(get_current_user),
):
    rows = await conn.fetch(
        "SELECT user_id, username, created_at FROM users ORDER BY created_at"
    )
    return [
        UserListItem(
            user_id=str(r["user_id"]),
            username=r["username"],
            created_at=r["created_at"].isoformat(),
        )
        for r in rows
    ]


@router.post("", response_model=UserListItem, status_code=201)
async def create_user(
    payload: UserCreate,
    conn: Connection = Depends(get_conn),
    _: UserOut = Depends(get_current_user),
):
    existing = await conn.fetchrow("SELECT 1 FROM users WHERE username = $1", payload.username)
    if existing:
        raise HTTPException(status_code=409, detail="Username already exists")
    row = await conn.fetchrow(
        "INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING user_id, username, created_at",
        payload.username,
        _hash(payload.password),
    )
    return UserListItem(
        user_id=str(row["user_id"]),
        username=row["username"],
        created_at=row["created_at"].isoformat(),
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


@router.delete("/{user_id}", status_code=204)
async def delete_user(
    user_id: UUID,
    conn: Connection = Depends(get_conn),
    current_user: UserOut = Depends(get_current_user),
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
