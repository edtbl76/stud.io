import json
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from asyncpg import Connection

from database import get_conn
from routers._crud_ops import EntityConfig, list_entities, get_entity, get_history, delete_entity, check_parent_refs, parse_filters
from routers.filter_operators import FilterableField, FilterEntry
from routers.auth import require_admin, get_current_user, UserOut
from schemas.libraries import LibraryCreate, LibraryUpdate, LibraryOut
from schemas.common import PagedResponse, ListParams
from routers._helpers import parent_ref_sql, encode_parent_refs, build_update_parts, _serializable, log_audit, AuditEntryWithData

router = APIRouter()

_SELECT_ONE = "SELECT * FROM libraries WHERE library_id = $1"
_NOT_FOUND = "Library not found"
_SORTABLE = frozenset({"library_name", "brand_name", "updated_at", "created_at"})
_DEFAULT_SORT = "library_name"
_FILTERABLE: dict[str, FilterableField] = {
    "name":  FilterableField("full_library_name ILIKE {val}", col_expr="full_library_name"),
    "brand": FilterableField("brand_name ILIKE {val}",        col_expr="brand_name"),
    "models": FilterableField(
        "EXISTS (SELECT 1 FROM unnest(COALESCE(model_ids, ARRAY[]::UUID[])) uid"
        " JOIN models m ON m.model_id = uid"
        " LEFT JOIN brands mb ON mb.brand_id = m.brand_id"
        " WHERE m.model_name ILIKE {val} OR mb.brand_name ILIKE {val})",
        empty_expr="(model_ids IS NULL OR cardinality(model_ids) = 0)",
    ),
    "tags": FilterableField(
        "EXISTS (SELECT 1 FROM unnest(COALESCE(tag_ids, ARRAY[]::UUID[])) uid"
        " JOIN tag_types t ON t.type_id = uid WHERE t.type_name ILIKE {val})",
        empty_expr="(tag_ids IS NULL OR cardinality(tag_ids) = 0)",
    ),
    "parents": FilterableField(
        empty_expr="(parent_ids IS NULL OR cardinality(parent_ids) = 0)",
    ),
    "created_at": FilterableField(col_expr="created_at"),
    "updated_at": FilterableField(col_expr="updated_at"),
}


async def _check_library_refs(conn: Connection, entity_id: UUID) -> None:
    await check_parent_refs(conn, entity_id, "Library")


_CONFIG = EntityConfig(
    table_name="libraries",
    view_name="libraries_view",
    id_column="library_id",
    not_found_msg=_NOT_FOUND,
    search_where="library_name ILIKE $1 OR brand_name ILIKE $1",
    sortable=_SORTABLE,
    default_sort=_DEFAULT_SORT,
    ref_check=_check_library_refs,
    filterable=_FILTERABLE,
)


@router.get("", response_model=PagedResponse[LibraryOut])
async def list_libraries(
    params: Annotated[ListParams, Depends()],
    conn: Annotated[Connection, Depends(get_conn)],
    filters: Annotated[dict[str, FilterEntry], Depends(parse_filters)],
):
    return await list_entities(conn, _CONFIG, params, LibraryOut, filters)


@router.get("/{library_id}", response_model=LibraryOut, responses={404: {"description": "Not found"}})
async def get_library(library_id: UUID, conn: Annotated[Connection, Depends(get_conn)]):
    return await get_entity(conn, _CONFIG, library_id, LibraryOut)


@router.post("", response_model=LibraryOut, status_code=201)
async def create_library(payload: LibraryCreate, conn: Annotated[Connection, Depends(get_conn)], user: Annotated[UserOut, Depends(require_admin)]):
    async with conn.transaction():
        row = await conn.fetchrow(
            f"""
            INSERT INTO libraries
                (library_name, brand_id, model_ids, description,
                 instrument_notes, recording_notes, workflow_notes,
                 tag_ids, attributes, parent_ids)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,
                    {parent_ref_sql('$10')})
            RETURNING library_id
            """,
            payload.library_name, payload.brand_id, payload.model_ids,
            payload.description, payload.instrument_notes, payload.recording_notes,
            payload.workflow_notes,
            payload.tag_ids,
            json.dumps(payload.attributes) if payload.attributes is not None else None,
            encode_parent_refs(payload.parent_ids),
        )
        new_row = await conn.fetchrow(_SELECT_ONE, row["library_id"])
        await log_audit(conn, "libraries", row["library_id"], "CREATE",
                        performed_by=user.username, new_data=_serializable(dict(new_row)))
    return await get_library(row["library_id"], conn)


@router.patch("/{library_id}", response_model=LibraryOut, responses={404: {"description": "Not found"}, 409: {"description": "Conflict"}})
async def update_library(library_id: UUID, payload: LibraryUpdate, conn: Annotated[Connection, Depends(get_conn)], user: Annotated[UserOut, Depends(require_admin)]):
    old_row = await conn.fetchrow(_SELECT_ONE, library_id)
    if not old_row:
        raise HTTPException(status_code=404, detail=_NOT_FOUND)
    if old_row["deleted_at"] is not None:
        raise HTTPException(status_code=409, detail="Cannot update a deleted record")

    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        return await get_library(library_id, conn)

    set_parts, values = build_update_parts(updates, payload.parent_ids)
    set_parts.append("updated_at = NOW()")
    # col is a Pydantic field name from model_dump(), not user input — not a SQL injection risk
    async with conn.transaction():
        await conn.execute(
            f"UPDATE libraries SET {', '.join(set_parts)} WHERE library_id = $1",
            library_id, *values,
        )
        new_row = await conn.fetchrow(_SELECT_ONE, library_id)
        await log_audit(conn, "libraries", library_id, "UPDATE",
                        performed_by=user.username,
                        old_data=_serializable(dict(old_row)),
                        new_data=_serializable(dict(new_row)))
    return await get_library(library_id, conn)


@router.get("/{library_id}/history", responses={401: {"description": "Unauthorized"}})
async def get_library_history(
    library_id: UUID,
    _current_user: Annotated[UserOut, Depends(get_current_user)],
    conn: Annotated[Connection, Depends(get_conn)],
) -> list[AuditEntryWithData]:
    return await get_history(conn, _CONFIG, library_id)


@router.delete("/{library_id}", status_code=204, responses={404: {"description": "Not found"}, 409: {"description": "Conflict"}})
async def delete_library(library_id: UUID, conn: Annotated[Connection, Depends(get_conn)], user: Annotated[UserOut, Depends(require_admin)]):
    return await delete_entity(conn, _CONFIG, library_id, user)
