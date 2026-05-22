"""Scanner rejection management — reject a match, list, and delete rejections."""
from __future__ import annotations

from typing import Annotated
from uuid import UUID

from asyncpg import Connection
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from database import get_conn
from routers.auth import UserOut, require_admin

router = APIRouter()


class RejectionOut(BaseModel):
    rejection_id: UUID
    fingerprint: str
    record_id: UUID
    record_table: str
    confidence: str
    rejected_by: str
    rejected_at: str


async def optimistic_purge(conn: Connection, fingerprint: str, record_id: UUID) -> None:
    """Delete rejection for (fingerprint, record_id) if it exists. Shared by links + workbench."""
    await conn.execute(
        "DELETE FROM scanner_rejections WHERE fingerprint=$1 AND record_id=$2",
        fingerprint, record_id,
    )


@router.post(
    "/results/{result_id}/reject",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={404: {"description": "Scan result not found"}},
)
async def reject_result(
    result_id: UUID,
    user: Annotated[UserOut, Depends(require_admin)],
    conn: Annotated[Connection, Depends(get_conn)],
) -> None:
    row = await conn.fetchrow(
        "SELECT name, vendor, record_id, record_table, confidence "
        "FROM plugin_scan_results WHERE result_id=$1",
        result_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Scan result not found")

    fingerprint = f"{row['vendor']} {row['name']}".lower().strip()

    async with conn.transaction():
        if row["record_id"] is not None:
            await conn.execute(
                "INSERT INTO scanner_rejections "
                "(fingerprint, record_id, record_table, confidence, rejected_by) "
                "VALUES ($1, $2, $3, $4, $5) ON CONFLICT (fingerprint, record_id) DO NOTHING",
                fingerprint, row["record_id"], row["record_table"],
                row["confidence"] or "unknown", user.username,
            )

        await conn.execute(
            "UPDATE plugin_scan_results "
            "SET record_id=NULL, record_table=NULL, confidence=NULL, score=NULL, "
            "confirmed_at=NULL, confirmed_by=NULL "
            "WHERE result_id=$1",
            result_id,
        )


@router.get("/rejections")
async def list_rejections(
    _user: Annotated[UserOut, Depends(require_admin)],
    conn: Annotated[Connection, Depends(get_conn)],
) -> list[RejectionOut]:
    rows = await conn.fetch(
        "SELECT rejection_id, fingerprint, record_id, record_table, confidence, "
        "rejected_by, rejected_at FROM scanner_rejections ORDER BY rejected_at DESC"
    )
    return [
        RejectionOut(
            rejection_id=r["rejection_id"],
            fingerprint=r["fingerprint"],
            record_id=r["record_id"],
            record_table=r["record_table"],
            confidence=r["confidence"],
            rejected_by=r["rejected_by"],
            rejected_at=r["rejected_at"].isoformat(),
        )
        for r in rows
    ]


@router.delete(
    "/rejections/{rejection_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={404: {"description": "Rejection not found"}},
)
async def delete_rejection(
    rejection_id: UUID,
    _user: Annotated[UserOut, Depends(require_admin)],
    conn: Annotated[Connection, Depends(get_conn)],
) -> None:
    result = await conn.execute(
        "DELETE FROM scanner_rejections WHERE rejection_id=$1", rejection_id
    )
    if result == "DELETE 0":
        raise HTTPException(status_code=404, detail="Rejection not found")
