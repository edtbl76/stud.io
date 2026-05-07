"""Unit tests for the shared rate-limiter key function."""
from __future__ import annotations

from unittest.mock import MagicMock


def _make_request(auth_header: str | None = None, client_host: str = "127.0.0.1"):
    req = MagicMock()
    req.headers = {"Authorization": auth_header} if auth_header else {}
    req.client = MagicMock()
    req.client.host = client_host
    return req


def test_key_by_user_returns_username_from_valid_jwt():
    from limiter import _key_by_user
    from routers.auth import _create_token
    raw_token = _create_token("adminuser", "admin")
    req = _make_request(auth_header=f"Bearer {raw_token}")
    result = _key_by_user(req)
    assert result == "adminuser"


def test_key_by_user_falls_back_to_ip_on_invalid_jwt():
    from limiter import _key_by_user
    req = _make_request(auth_header="Bearer not.a.valid.token", client_host="10.0.0.1")
    result = _key_by_user(req)
    assert result == "10.0.0.1"


def test_key_by_user_falls_back_to_ip_when_no_auth_header():
    from limiter import _key_by_user
    req = _make_request(client_host="192.168.1.1")
    result = _key_by_user(req)
    assert result == "192.168.1.1"


def test_key_by_user_falls_back_to_ip_when_sub_missing():
    from jose import jwt as _jwt
    from limiter import _key_by_user
    from config import settings
    token = _jwt.encode({"role": "admin"}, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    req = _make_request(auth_header=f"Bearer {token}", client_host="10.0.0.2")
    result = _key_by_user(req)
    assert result == "10.0.0.2"


def test_key_by_user_handles_missing_client():
    from limiter import _key_by_user
    req = _make_request()
    req.client = None
    result = _key_by_user(req)
    assert result == "unknown"
