from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from asyncpg import Connection

from database import get_conn
from routers._crud_ops import EntityConfig, list_entities, get_entity, get_history, delete_entity, parse_filters
from routers.auth import require_admin, get_current_user, UserOut
from schemas.workstations import WorkstationCreate, WorkstationUpdate, WorkstationOut
from schemas.common import PagedResponse, ListParams
from routers._helpers import _serializable, log_audit, AuditEntryWithData

router = APIRouter()

_SELECT_ONE = "SELECT * FROM workstations WHERE workstation_id = $1"
_NOT_FOUND = "Workstation not found"
_SORTABLE = frozenset({"full_tool_name", "brand_name", "version", "created_at", "updated_at"})
_DEFAULT_SORT = "full_tool_name"
_FILTERABLE = {
    "name":    "full_tool_name ILIKE {val}",
    "brand":   "brand_name ILIKE {val}",
    "version": "version ILIKE {val}",
    "types": (
        "EXISTS (SELECT 1 FROM unnest(COALESCE(tool_type_ids, ARRAY[]::UUID[])) uid"
        " JOIN tool_types t ON t.type_id = uid WHERE t.type_name ILIKE {val})"
    ),
    "formats": (
        "EXISTS (SELECT 1 FROM unnest(COALESCE(plugin_format_ids, ARRAY[]::UUID[])) uid"
        " JOIN plugin_formats t ON t.type_id = uid WHERE t.type_name ILIKE {val})"
    ),
    "tags": (
        "EXISTS (SELECT 1 FROM unnest(COALESCE(tag_ids, ARRAY[]::UUID[])) uid"
        " JOIN tag_types t ON t.type_id = uid WHERE t.type_name ILIKE {val})"
    ),
}

_CONFIG = EntityConfig(
    table_name="workstations",
    view_name="workstations_view",
    id_column="workstation_id",
    not_found_msg=_NOT_FOUND,
    search_where="",  # deprecated
    sortable=_SORTABLE,
    default_sort=_DEFAULT_SORT,
    filterable=_FILTERABLE,
)


@router.get("", response_model=PagedResponse[WorkstationOut])
async def list_workstations(
    params: Annotated[ListParams, Depends()],
    conn: Annotated[Connection, Depends(get_conn)],
    filters: Annotated[dict[str, str], Depends(parse_filters)],
):
    return await list_entities(conn, _CONFIG, params, WorkstationOut, filters)


@router.get("/{workstation_id}", response_model=WorkstationOut, responses={404: {"description": "Not found"}})
async def get_workstation(workstation_id: UUID, conn: Annotated[Connection, Depends(get_conn)]):
    return await get_entity(conn, _CONFIG, workstation_id, WorkstationOut)


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


@router.get("/{workstation_id}/history", responses={401: {"description": "Unauthorized"}})
async def get_workstation_history(
    workstation_id: UUID,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    conn: Annotated[Connection, Depends(get_conn)],
) -> list[AuditEntryWithData]:
    return await get_history(conn, _CONFIG, workstation_id)


@router.delete("/{workstation_id}", status_code=204, responses={404: {"description": "Not found"}})
async def delete_workstation(workstation_id: UUID, conn: Annotated[Connection, Depends(get_conn)], user: Annotated[UserOut, Depends(require_admin)]):
    return await delete_entity(conn, _CONFIG, workstation_id, user)
