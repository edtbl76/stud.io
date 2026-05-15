from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from asyncpg import Connection

from database import get_conn
from routers._crud_ops import EntityConfig, list_entities, get_entity, get_history, delete_entity, parse_filters
from routers.filter_operators import FilterableField, FilterEntry
from routers.auth import require_admin, get_current_user, UserOut
from schemas.workstations import WorkstationCreate, WorkstationUpdate, WorkstationOut
from schemas.common import PagedResponse, ListParams
from routers._helpers import build_update_parts, _serializable, log_audit, AuditEntryWithData

router = APIRouter()

_SELECT_ONE = "SELECT * FROM workstations WHERE workstation_id = $1"
_NOT_FOUND = "Workstation not found"
_SORTABLE = frozenset({"full_tool_name", "brand_name", "version", "created_at", "updated_at"})
_DEFAULT_SORT = "full_tool_name"
_FILTERABLE: dict[str, FilterableField] = {
    "name":    FilterableField("full_tool_name ILIKE {val}", col_expr="full_tool_name"),
    "brand":   FilterableField("brand_name ILIKE {val}",    col_expr="brand_name"),
    "version": FilterableField("version ILIKE {val}",       col_expr="version"),
    "types": FilterableField(
        "EXISTS (SELECT 1 FROM unnest(COALESCE(tool_type_ids, ARRAY[]::UUID[])) uid"
        " JOIN tool_types t ON t.type_id = uid WHERE t.type_name ILIKE {val})",
        empty_expr="(tool_type_ids IS NULL OR cardinality(tool_type_ids) = 0)",
    ),
    "formats": FilterableField(
        "EXISTS (SELECT 1 FROM unnest(COALESCE(plugin_format_ids, ARRAY[]::UUID[])) uid"
        " JOIN plugin_formats t ON t.type_id = uid WHERE t.type_name ILIKE {val})",
        empty_expr="(plugin_format_ids IS NULL OR cardinality(plugin_format_ids) = 0)",
    ),
    "tags": FilterableField(
        "EXISTS (SELECT 1 FROM unnest(COALESCE(tag_ids, ARRAY[]::UUID[])) uid"
        " JOIN tag_types t ON t.type_id = uid WHERE t.type_name ILIKE {val})",
        empty_expr="(tag_ids IS NULL OR cardinality(tag_ids) = 0)",
    ),
    "created_at": FilterableField(col_expr="created_at"),
    "updated_at": FilterableField(col_expr="updated_at"),
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
    filters: Annotated[dict[str, FilterEntry], Depends(parse_filters)],
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
                 plugin_format_ids, description, workflow_notes, tag_ids, disk_paths)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
            RETURNING workstation_id
            """,
            payload.tool_name, payload.brand_id, payload.version,
            payload.tool_type_ids, payload.plugin_format_ids,
            payload.description, payload.workflow_notes, payload.tag_ids,
            [e.model_dump() for e in payload.disk_paths],
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

    set_parts, values = build_update_parts(updates, None)
    set_parts.append("updated_at = NOW()")
    # col is a Pydantic field name from model_dump(), not user input — not a SQL injection risk
    async with conn.transaction():
        await conn.execute(
            f"UPDATE workstations SET {', '.join(set_parts)} WHERE workstation_id = $1",
            workstation_id, *values,
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
