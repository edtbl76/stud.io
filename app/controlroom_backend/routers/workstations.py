from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from asyncpg import Connection

from database import get_conn
from routers.auth import require_admin, UserOut
from schemas.workstations import WorkstationCreate, WorkstationUpdate, WorkstationOut
from routers._helpers import _serializable, log_audit

router = APIRouter()

_SELECT = "SELECT * FROM workstations_view"
_SELECT_ONE = "SELECT * FROM workstations WHERE workstation_id = $1"
_NOT_FOUND = "Workstation not found"


@router.get("", response_model=list[WorkstationOut])
async def list_workstations(q: str | None = None, *, conn: Annotated[Connection, Depends(get_conn)]):
    if q:
        rows = await conn.fetch(
            _SELECT + " WHERE tool_name ILIKE $1 OR brand_name ILIKE $1", f"%{q}%"
        )
    else:
        rows = await conn.fetch(_SELECT)
    return [WorkstationOut(**dict(r)) for r in rows]


@router.get("/{workstation_id}", response_model=WorkstationOut, responses={404: {"description": "Not found"}})
async def get_workstation(workstation_id: UUID, conn: Annotated[Connection, Depends(get_conn)]):
    row = await conn.fetchrow(_SELECT + " WHERE workstation_id = $1", workstation_id)
    if not row:
        raise HTTPException(status_code=404, detail=_NOT_FOUND)  # NOSONAR
    return WorkstationOut(**dict(row))


@router.post("", response_model=WorkstationOut, status_code=201)
async def create_workstation(payload: WorkstationCreate, conn: Annotated[Connection, Depends(get_conn)], user: Annotated[UserOut, Depends(require_admin)]):
    async with conn.transaction():
        row = await conn.fetchrow(
            """
            INSERT INTO workstations
                (tool_name, brand_id, version, tool_type_ids,
                 plugin_format_ids, description, workflow_notes, tag_ids)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
            RETURNING workstation_id
            """,
            payload.tool_name, payload.brand_id, payload.version,
            payload.tool_type_ids, payload.plugin_format_ids,
            payload.description, payload.workflow_notes, payload.tag_ids,
        )
        new_row = await conn.fetchrow(_SELECT_ONE, row["workstation_id"])
        await log_audit(conn, "workstations", row["workstation_id"], "CREATE",
                        performed_by=user.username, new_data=_serializable(dict(new_row)))
    return await get_workstation(row["workstation_id"], conn)


@router.patch("/{workstation_id}", response_model=WorkstationOut, responses={404: {"description": "Not found"}, 409: {"description": "Conflict"}})
async def update_workstation(workstation_id: UUID, payload: WorkstationUpdate, conn: Annotated[Connection, Depends(get_conn)], user: Annotated[UserOut, Depends(require_admin)]):
    old_row = await conn.fetchrow(_SELECT_ONE, workstation_id)
    if not old_row:
        raise HTTPException(status_code=404, detail=_NOT_FOUND)
    if old_row["deleted_at"] is not None:
        raise HTTPException(status_code=409, detail="Cannot update a deleted record")

    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        return await get_workstation(workstation_id, conn)

    set_clauses = ", ".join(f"{col} = ${i+2}" for i, col in enumerate(updates))
    async with conn.transaction():
        await conn.execute(
            f"UPDATE workstations SET {set_clauses}, updated_at = NOW() WHERE workstation_id = $1",
            workstation_id, *updates.values(),
        )
        new_row = await conn.fetchrow(_SELECT_ONE, workstation_id)
        await log_audit(conn, "workstations", workstation_id, "UPDATE",
                        performed_by=user.username,
                        old_data=_serializable(dict(old_row)),
                        new_data=_serializable(dict(new_row)))
    return await get_workstation(workstation_id, conn)


@router.delete("/{workstation_id}", status_code=204, responses={404: {"description": "Not found"}})
async def delete_workstation(workstation_id: UUID, conn: Annotated[Connection, Depends(get_conn)], user: Annotated[UserOut, Depends(require_admin)]):
    row = await conn.fetchrow(_SELECT_ONE, workstation_id)
    if not row:
        raise HTTPException(status_code=404, detail=_NOT_FOUND)
    if row["deleted_at"] is not None:
        return JSONResponse(
            status_code=200,
            content={"detail": "Record is already deleted. To permanently remove it, use Change Review."}
        )
    async with conn.transaction():
        await conn.execute("UPDATE workstations SET deleted_at = NOW() WHERE workstation_id = $1", workstation_id)
        await log_audit(conn, "workstations", workstation_id, "DELETE",
                        performed_by=user.username, old_data=_serializable(dict(row)))
