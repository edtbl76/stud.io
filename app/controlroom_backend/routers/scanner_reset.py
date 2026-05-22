"""Plugin Scanner — reset endpoints.

  POST   /scanner/admin/reset/soft — disable all rules (reversible)
  POST   /scanner/admin/reset/hard — full wipe + re-seed seeded patterns
"""
from __future__ import annotations

from typing import Annotated

from asyncpg import Connection
from fastapi import APIRouter, Depends, HTTPException

from database import get_conn
from routers.auth import UserOut, require_admin
from schemas.scanner_workbench import ResetRequest, ResetResult

router = APIRouter()

_HARD_RESET_CONFIRMATION = "RESET ALL SCANNER DATA"


@router.post("/admin/reset/soft")
async def reset_soft(
    _user: Annotated[UserOut, Depends(require_admin)],
    conn: Annotated[Connection, Depends(get_conn)],
) -> ResetResult:
    """Disable all rules without deleting any data. Reversible."""
    async with conn.transaction():
        vr = await conn.execute("UPDATE scanner_vendor_rules SET enabled=FALSE")
        nr = await conn.execute("UPDATE scanner_name_rules SET enabled=FALSE")
        pr = await conn.execute("UPDATE scanner_name_patterns SET enabled=FALSE")
    total = sum(int(s.split()[-1]) for s in (vr, nr, pr))
    return ResetResult(type="soft", rules_disabled=total)


@router.post("/admin/reset/hard", responses={422: {"description": "Invalid confirmation text"}})
async def reset_hard(
    body: ResetRequest,
    _user: Annotated[UserOut, Depends(require_admin)],
    conn: Annotated[Connection, Depends(get_conn)],
) -> ResetResult:
    """Full wipe of all scan data and rules. Seeded pattern rules survive (set disabled).

    Requires exact confirmation text: 'RESET ALL SCANNER DATA'.
    """
    if body.confirmation_text != _HARD_RESET_CONFIRMATION:
        raise HTTPException(
            status_code=422,
            detail=f"confirmation_text must be exactly '{_HARD_RESET_CONFIRMATION}'",
        )

    async with conn.transaction():
        results_deleted = int(
            (await conn.execute("DELETE FROM plugin_scan_results")).split()[-1]
        )
        await conn.execute("DELETE FROM plugin_scans")
        await conn.execute("DELETE FROM scanner_vendor_rules")
        await conn.execute("DELETE FROM scanner_name_rules")
        await conn.execute("DELETE FROM scanner_name_aliases")
        await conn.execute("DELETE FROM scanner_rejections")
        await conn.execute("DELETE FROM scanner_exclusions")
        await conn.execute(
            "DELETE FROM scanner_name_patterns WHERE is_seeded = FALSE"
        )
        seeded = int(
            (await conn.execute(
                "UPDATE scanner_name_patterns SET enabled=FALSE WHERE is_seeded=TRUE"
            )).split()[-1]
        )

    return ResetResult(
        type="hard",
        records_wiped=results_deleted,
        seeded_rules_restored=seeded,
    )
