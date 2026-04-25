import os
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, Request, Response

from routers.auth import UserOut, get_current_user

router = APIRouter()

_GEARLIST_URL = os.environ.get("GEARLIST_URL", "http://gearlist_backend:4001")
_client: httpx.AsyncClient | None = None


def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(base_url=_GEARLIST_URL, timeout=30.0)
    return _client


@router.api_route("/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def proxy(
    request: Request,
    path: str,
    user: Annotated[UserOut, Depends(get_current_user)],
) -> Response:
    resp = await _get_client().request(
        method=request.method,
        url=f"/{path}",
        headers={"X-User": user.username, "X-Role": user.role},
        content=await request.body(),
        params=request.query_params,
    )
    return Response(
        content=resp.content,
        status_code=resp.status_code,
        media_type=resp.headers.get("content-type"),
    )
