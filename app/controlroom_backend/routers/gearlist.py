import os
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, Request, Response

from routers.auth import UserOut, get_current_user

router = APIRouter()

_GEARLIST_URL = os.environ.get("GEARLIST_URL", "http://gearlist_backend:4001")
_GEARLIST_TIMEOUT = 30.0
_client: httpx.AsyncClient | None = None


def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(base_url=_GEARLIST_URL, timeout=_GEARLIST_TIMEOUT)
    return _client


async def close_client() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None


@router.api_route("/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def proxy(
    request: Request,
    path: str,
    user: Annotated[UserOut, Depends(get_current_user)],
) -> Response:
    headers: dict[str, str] = {"X-User": user.username, "X-Role": user.role}
    for h in ("content-type", "accept"):
        if v := request.headers.get(h):
            headers[h] = v
    resp = await _get_client().request(
        method=request.method,
        url=f"/{path}",
        headers=headers,
        content=await request.body(),
        params=list(request.query_params.multi_items()),
    )
    return Response(
        content=resp.content,
        status_code=resp.status_code,
        media_type=resp.headers.get("content-type"),
    )
