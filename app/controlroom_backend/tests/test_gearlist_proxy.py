"""Tests for the /gearlist proxy router."""
from unittest.mock import AsyncMock, MagicMock, patch

import routers.gearlist as gearlist_module

import pytest


def _mock_resp(status: int = 200, body: bytes = b'{"status":"ok"}') -> MagicMock:
    r = MagicMock()
    r.content = body
    r.status_code = status
    r.headers = {"content-type": "application/json"}
    return r


@pytest.mark.asyncio
async def test_proxy_forwards_authenticated_request(client, auth_headers):
    with patch("routers.gearlist._get_client") as mock_get:
        mock_get.return_value.request = AsyncMock(return_value=_mock_resp())
        response = await client.get("/gearlist/health", headers=auth_headers)

    assert response.status_code == 200
    mock_get.return_value.request.assert_awaited_once()


@pytest.mark.asyncio
async def test_proxy_injects_user_headers(client, auth_headers):
    with patch("routers.gearlist._get_client") as mock_get:
        mock_get.return_value.request = AsyncMock(return_value=_mock_resp())
        await client.get("/gearlist/health", headers=auth_headers)

    _, kwargs = mock_get.return_value.request.call_args
    assert kwargs["headers"]["X-User"] == "testuser"
    assert kwargs["headers"]["X-Role"] == "user"


@pytest.mark.asyncio
async def test_proxy_forwards_content_type_and_accept(client, auth_headers):
    auth_headers["content-type"] = "application/json"
    auth_headers["accept"] = "application/json"
    with patch("routers.gearlist._get_client") as mock_get:
        mock_get.return_value.request = AsyncMock(return_value=_mock_resp())
        await client.post("/gearlist/guitars", headers=auth_headers, content=b"{}")

    _, kwargs = mock_get.return_value.request.call_args
    assert kwargs["headers"]["content-type"] == "application/json"
    assert kwargs["headers"]["accept"] == "application/json"
    assert "X-User" in kwargs["headers"]


@pytest.mark.asyncio
async def test_proxy_returns_401_without_auth(client):
    response = await client.get("/gearlist/health")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_proxy_propagates_upstream_status(client, auth_headers):
    with patch("routers.gearlist._get_client") as mock_get:
        mock_get.return_value.request = AsyncMock(return_value=_mock_resp(status=503))
        response = await client.get("/gearlist/health", headers=auth_headers)

    assert response.status_code == 503


@pytest.mark.asyncio
async def test_close_client_closes_and_clears():
    mock_client = AsyncMock()
    gearlist_module._client = mock_client
    await gearlist_module.close_client()
    mock_client.aclose.assert_awaited_once()
    assert gearlist_module._client is None


@pytest.mark.asyncio
async def test_close_client_noop_when_none():
    gearlist_module._client = None
    await gearlist_module.close_client()  # must not raise
