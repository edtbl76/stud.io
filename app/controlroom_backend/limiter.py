"""Shared SlowAPI rate limiter instance.

Key function: authenticated username from JWT, falling back to client IP.
This ensures the rate limit is per-user rather than per-IP, so shared
office networks do not block all admins when one hits the limit.
"""
from __future__ import annotations

import logging

from fastapi import Request
import jwt as _jwt
from jwt.exceptions import PyJWTError as JWTError
from slowapi import Limiter

from config import settings

log = logging.getLogger(__name__)


def _key_by_user(request: Request) -> str:
    token = request.headers.get("Authorization", "")
    if token.startswith("Bearer "):
        try:
            payload = _jwt.decode(
                token[7:], settings.jwt_secret, algorithms=[settings.jwt_algorithm]
            )
            if subject := payload.get("sub"):
                return subject
        except JWTError as exc:
            log.debug("JWT decode failed for rate-limit key: %s", exc)
    return request.client.host if request.client else "unknown"


limiter = Limiter(key_func=_key_by_user)
