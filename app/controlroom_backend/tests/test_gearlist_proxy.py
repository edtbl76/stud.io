"""Tests for the /gearlist proxy router."""
from unittest.mock import AsyncMock, MagicMock, patch

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
    assert "X-User" in kwargs["headers"]
    assert "X-Role" in kwargs["headers"]


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
