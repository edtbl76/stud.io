from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from asyncpg import Connection

from database import get_conn
from schemas.workstations import WorkstationCreate, WorkstationUpdate, WorkstationOut

router = APIRouter()

_SELECT = "SELECT * FROM workstations_view"


@router.get("", response_model=list[WorkstationOut])
async def list_workstations(q: str | None = None, conn: Connection = Depends(get_conn)):
    if q:
        rows = await conn.fetch(
            _SELECT + " WHERE tool_name ILIKE $1 OR brand_name ILIKE $1", f"%{q}%"
        )
    else:
        rows = await conn.fetch(_SELECT)
    return [WorkstationOut(**dict(r)) for r in rows]


@router.get("/{workstation_id}", response_model=WorkstationOut)
async def get_workstation(workstation_id: UUID, conn: Connection = Depends(get_conn)):
    row = await conn.fetchrow(_SELECT + " WHERE workstation_id = $1", workstation_id)
    if not row:
        raise HTTPException(status_code=404, detail="Workstation not found")
    return WorkstationOut(**dict(row))


@router.post("", response_model=WorkstationOut, status_code=201)
async def create_workstation(payload: WorkstationCreate, conn: Connection = Depends(get_conn)):
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
    return await get_workstation(row["workstation_id"], conn)


@router.patch("/{workstation_id}", response_model=WorkstationOut)
async def update_workstation(workstation_id: UUID, payload: WorkstationUpdate, conn: Connection = Depends(get_conn)):
    if not await conn.fetchrow("SELECT 1 FROM workstations WHERE workstation_id = $1", workstation_id):
        raise HTTPException(status_code=404, detail="Workstation not found")

    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        return await get_workstation(workstation_id, conn)

    set_clauses = ", ".join(f"{col} = ${i+2}" for i, col in enumerate(updates))
    await conn.execute(
        f"UPDATE workstations SET {set_clauses}, updated_at = NOW() WHERE workstation_id = $1",
        workstation_id, *updates.values(),
    )
    return await get_workstation(workstation_id, conn)


@router.delete("/{workstation_id}", status_code=204)
async def delete_workstation(workstation_id: UUID, conn: Connection = Depends(get_conn)):
    if not await conn.fetchrow("SELECT 1 FROM workstations WHERE workstation_id = $1", workstation_id):
        raise HTTPException(status_code=404, detail="Workstation not found")
    await conn.execute("DELETE FROM workstations WHERE workstation_id = $1", workstation_id)
