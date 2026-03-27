import json
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from asyncpg import Connection

from database import get_conn
from routers._crud_ops import (
    EntityConfig,
    list_entities,
    get_entity,
    get_history,
    delete_entity,
    parse_filters,
)
from routers._helpers import _serializable, log_audit, AuditEntryWithData
from routers.auth import require_admin, get_current_user, UserOut
from schemas.common import PagedResponse, ListParams
from schemas.models import ModelCreate, ModelUpdate, ModelOut

router = APIRouter()

_SELECT = "SELECT * FROM models_view"
_SELECT_ONE = "SELECT * FROM models WHERE model_id = $1"
_NOT_FOUND = "Model not found"
_SORTABLE = frozenset({"model_name", "brand_name", "updated_at", "created_at"})
_DEFAULT_SORT = "model_name"
_FILTERABLE = {
    "name":  "model_name ILIKE {val}",
    "brand": "brand_name ILIKE {val}",
    "types": (
        "EXISTS (SELECT 1 FROM unnest(COALESCE(model_type_ids, ARRAY[]::UUID[])) uid"
        " JOIN model_types t ON t.type_id = uid WHERE t.type_name ILIKE {val})"
    ),
}

_REF_CHECKS = [
    ("effects",           "model_ids"),
    ("instruments",       "model_ids"),
    ("libraries",         "model_ids"),
    ("measurement_tools", "model_ids"),
    ("reference_tools",   "model_ids"),
]

# noinspection SqlInjection
async def _check_model_refs(conn: Connection, model_id: UUID) -> None:
    for table, col in _REF_CHECKS:
        if await conn.fetchrow(
            f"SELECT 1 FROM {table} WHERE $1 = ANY({col}) AND deleted_at IS NULL LIMIT 1", model_id
        ):
            raise HTTPException(status_code=409, detail=f"Model is referenced by {table}")


_CONFIG = EntityConfig(
    table_name="models",
    view_name="models_view",
    id_column="model_id",
    not_found_msg=_NOT_FOUND,
    search_where="model_name ILIKE $1 OR brand_name ILIKE $1",
    sortable=_SORTABLE,
    default_sort=_DEFAULT_SORT,
    ref_check=_check_model_refs,
    filterable=_FILTERABLE,
)

# noinspection SqlInjection
@router.get("", response_model=PagedResponse[ModelOut])
async def list_models(
    params: Annotated[ListParams, Depends()],
    conn: Annotated[Connection, Depends(get_conn)],
    filters: Annotated[dict[str, str], Depends(parse_filters)],
):
    return await list_entities(conn, _CONFIG, params, ModelOut, filters)


@router.get("/{model_id}", response_model=ModelOut, responses={404: {"description": "Not found"}})
async def get_model(model_id: UUID, conn: Annotated[Connection, Depends(get_conn)]):
    return await get_entity(conn, _CONFIG, model_id, ModelOut)



@router.post("", response_model=ModelOut, status_code=201)
async def create_model(payload: ModelCreate, conn: Annotated[Connection, Depends(get_conn)], user: Annotated[UserOut, Depends(require_admin)]):
    async with conn.transaction():
        row = await conn.fetchrow(
            """
            INSERT INTO models
                (model_name, brand_id, model_type_ids, creator, years_active,
                 links, description, recording_notes, artist_reference, attributes)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
            RETURNING model_id
            """,
            payload.model_name, payload.brand_id,
            payload.model_type_ids, payload.creator, payload.years_active,
            payload.links, payload.description, payload.recording_notes,
            payload.artist_reference,
            json.dumps(payload.attributes) if payload.attributes is not None else None,
        )
        new_row = await conn.fetchrow(_SELECT_ONE, row["model_id"])
        await log_audit(conn, "models", row["model_id"], "CREATE",
                        performed_by=user.username, new_data=_serializable(dict(new_row)))
    return await get_model(row["model_id"], conn)

# noinspection SqlInjection
@router.patch("/{model_id}", response_model=ModelOut, responses={404: {"description": "Not found"}, 409: {"description": "Conflict"}})
async def update_model(model_id: UUID, payload: ModelUpdate, conn: Annotated[Connection, Depends(get_conn)], user: Annotated[UserOut, Depends(require_admin)]):
    old_row = await conn.fetchrow(_SELECT_ONE, model_id)
    if not old_row:
        raise HTTPException(status_code=404, detail=_NOT_FOUND)
    if old_row["deleted_at"] is not None:
        raise HTTPException(status_code=409, detail="Cannot update a deleted record")

    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        return await get_model(model_id, conn)

    if "attributes" in updates and updates["attributes"] is not None:
        updates["attributes"] = json.dumps(updates["attributes"])

    """
    This is line shows a SQL Injection vulnerability. (CWE-89)
        https://cwe.mitre.org/data/definitions/89.html
    
        It's a false positive. `col` is a Pydantic field that comes from payload.model_dump(exclude_unset=True), 
        which is guaranteed to only contain valid column names defined in ModelUpdate, 
        and cannot be manipulated by the user to inject SQL. 
        
        The values are still passed as parameters, so there's no risk of injection there either.
    """
    set_clauses = ", ".join(f"{col} = ${i+2}" for i, col in enumerate(updates))
    async with conn.transaction():
        await conn.execute(
            f"UPDATE models SET {set_clauses}, updated_at = NOW() WHERE model_id = $1",
            model_id, *updates.values(),
        )
        new_row = await conn.fetchrow(_SELECT_ONE, model_id)
        await log_audit(conn, "models", model_id, "UPDATE",
                        performed_by=user.username,
                        old_data=_serializable(dict(old_row)),
                        new_data=_serializable(dict(new_row)))
    return await get_model(model_id, conn)


@router.get("/{model_id}/history", responses={401: {"description": "Unauthorized"}})
async def get_model_history(
    model_id: UUID,
    _current_user: Annotated[UserOut, Depends(get_current_user)],
    conn: Annotated[Connection, Depends(get_conn)],
) -> list[AuditEntryWithData]:
    return await get_history(conn, _CONFIG, model_id)


@router.delete("/{model_id}",
               status_code=204,
               responses={404: {"description": "Not found"}, 409: {"description": "Conflict"}})
async def delete_model(
        model_id: UUID,
        conn: Annotated[Connection, Depends(get_conn)],
        user: Annotated[UserOut, Depends(require_admin)]
):
    return await delete_entity(conn, _CONFIG, model_id, user)


