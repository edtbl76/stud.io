"""Plugin Scanner — auth dependencies.

API-key auth for the scanner binary (`get_scanner_auth`) and the dual
JWT-or-API-key dependency (`get_scanner_auth_or_user`) shared by scanner routers.
"""
from __future__ import annotations

from typing import Annotated

import bcrypt
import jwt
from jwt.exceptions import PyJWTError as JWTError
from asyncpg import Connection
from fastapi import Depends, Header, HTTPException, status

from config import settings
from database import get_conn

_BEARER_PREFIX = "Bearer "


def _is_bearer_token(authorization: str | None) -> bool:
    return bool(authorization and authorization.startswith(_BEARER_PREFIX))


async def get_scanner_auth(
    conn: Annotated[Connection, Depends(get_conn)],
    authorization: Annotated[str | None, Header()] = None,
) -> str:
    if not _is_bearer_token(authorization):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key")
    token = authorization.removeprefix(_BEARER_PREFIX).strip()
    rows = await conn.fetch(
        "SELECT label, hashed_key FROM scanner_api_keys WHERE revoked_at IS NULL"
    )
    for row in rows:
        if bcrypt.checkpw(token.encode(), row["hashed_key"].encode()):
            return row["label"]
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or revoked API key")


async def get_scanner_auth_or_user(
    conn: Annotated[Connection, Depends(get_conn)],
    authorization: Annotated[str | None, Header()] = None,
) -> None:
    """Accept either a user session JWT or a scanner API key as Bearer token."""
    if not _is_bearer_token(authorization):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    token = authorization.removeprefix(_BEARER_PREFIX).strip()
    if await _valid_jwt(token, conn) or await _valid_api_key(token, conn):
        return
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")


async def _valid_jwt(token: str, conn: Connection) -> bool:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        username: str | None = payload.get("sub")
        if not username:
            return False
        return bool(await conn.fetchrow("SELECT user_id FROM users WHERE username = $1", username))
    except JWTError:
        return False


async def _valid_api_key(token: str, conn: Connection) -> bool:
    rows = await conn.fetch("SELECT hashed_key FROM scanner_api_keys WHERE revoked_at IS NULL")
    return any(bcrypt.checkpw(token.encode(), row["hashed_key"].encode()) for row in rows)
