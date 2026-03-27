import json
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from asyncpg import Connection

from database import get_conn
from routers._crud_ops import EntityConfig, list_entities, get_entity, get_history, delete_entity, check_parent_refs, parse_filters
from routers.auth import require_admin, get_current_user, UserOut
from schemas.effects import EffectCreate, EffectUpdate, EffectOut
from schemas.common import PagedResponse, ListParams
from routers._helpers import parent_ref_sql, encode_parent_refs, _serializable, log_audit, AuditEntryWithData

router = APIRouter()

_SELECT_ONE = "SELECT * FROM effects WHERE effect_id = $1"
_NOT_FOUND = "Effect not found"
_SORTABLE = frozenset({"effect_name", "brand_name", "version", "collection", "updated_at", "created_at"})
_DEFAULT_SORT = "effect_name"
_FILTERABLE = {
    "name":       "effect_name ILIKE {val}",
    "brand":      "brand_name ILIKE {val}",
    "version":    "version ILIKE {val}",
    "collection": "collection ILIKE {val}",
    "types": (
        "EXISTS (SELECT 1 FROM unnest(COALESCE(effect_type_ids, ARRAY[]::UUID[])) uid"
        " JOIN effect_types t ON t.type_id = uid WHERE t.type_name ILIKE {val})"
    ),
    "models": (
        "EXISTS (SELECT 1 FROM unnest(COALESCE(model_ids, ARRAY[]::UUID[])) uid"
        " JOIN models m ON m.model_id = uid"
        " LEFT JOIN brands mb ON mb.brand_id = m.brand_id"
        " WHERE m.model_name ILIKE {val} OR mb.brand_name ILIKE {val})"
    ),
    "tags": (
        "EXISTS (SELECT 1 FROM unnest(COALESCE(tag_ids, ARRAY[]::UUID[])) uid"
        " JOIN tag_types t ON t.type_id = uid WHERE t.type_name ILIKE {val})"
    ),
}


async def _check_effect_refs(conn: Connection, entity_id: UUID) -> None:
    await check_parent_refs(conn, entity_id, "Effect")


_CONFIG = EntityConfig(
    table_name="effects",
    view_name="effects_view",
    id_column="effect_id",
    not_found_msg=_NOT_FOUND,
    search_where="effect_name ILIKE $1 OR brand_name ILIKE $1",
    sortable=_SORTABLE,
    default_sort=_DEFAULT_SORT,
    ref_check=_check_effect_refs,
    filterable=_FILTERABLE,
)


@router.get("", response_model=PagedResponse[EffectOut])
async def list_effects(
    params: Annotated[ListParams, Depends()],
    conn: Annotated[Connection, Depends(get_conn)],
    filters: Annotated[dict[str, str], Depends(parse_filters)],
):
    return await list_entities(conn, _CONFIG, params, EffectOut, filters)


@router.get("/{effect_id}", response_model=EffectOut, responses={404: {"description": "Not found"}})
async def get_effect(effect_id: UUID, conn: Annotated[Connection, Depends(get_conn)]):
    return await get_entity(conn, _CONFIG, effect_id, EffectOut)


@router.post("", response_model=EffectOut, status_code=201)
async def create_effect(payload: EffectCreate, conn: Annotated[Connection, Depends(get_conn)], user: Annotated[UserOut, Depends(require_admin)]):
    async with conn.transaction():
        row = await conn.fetchrow(
            f"""
            INSERT INTO effects
                (effect_name, brand_id, model_ids, version, collection,
                 effect_type_ids, tool_type_ids, plugin_format_ids,
                 description, workflow_notes, recording_notes, artist_reference,
                 attributes, tag_ids, parent_ids)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
                    {parent_ref_sql('$15')})
            RETURNING effect_id
            """,
            payload.effect_name, payload.brand_id, payload.model_ids,
            payload.version, payload.collection,
            payload.effect_type_ids, payload.tool_type_ids, payload.plugin_format_ids,
            payload.description, payload.workflow_notes, payload.recording_notes,
            payload.artist_reference,
            json.dumps(payload.attributes) if payload.attributes is not None else None,
            payload.tag_ids,
            encode_parent_refs(payload.parent_ids),
        )
        new_row = await conn.fetchrow(_SELECT_ONE, row["effect_id"])
        await log_audit(conn, "effects", row["effect_id"], "CREATE",
                        performed_by=user.username, new_data=_serializable(dict(new_row)))
    return await get_effect(row["effect_id"], conn)


@router.patch("/{effect_id}", response_model=EffectOut, responses={404: {"description": "Not found"}, 409: {"description": "Conflict"}})
async def update_effect(effect_id: UUID, payload: EffectUpdate, conn: Annotated[Connection, Depends(get_conn)], user: Annotated[UserOut, Depends(require_admin)]):
    old_row = await conn.fetchrow(_SELECT_ONE, effect_id)
    if not old_row:
        raise HTTPException(status_code=404, detail=_NOT_FOUND)
    if old_row["deleted_at"] is not None:
        raise HTTPException(status_code=409, detail="Cannot update a deleted record")

    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        return await get_effect(effect_id, conn)

    set_parts, values, i = [], [], 2
    for col, val in updates.items():
        if col == "parent_ids":
            set_parts.append(f"{col} = {parent_ref_sql(f'${i}')}")
            values.append(encode_parent_refs(val))
        elif col == "attributes" and val is not None:
            set_parts.append(f"{col} = ${i}")
            values.append(json.dumps(val))
        else:
            set_parts.append(f"{col} = ${i}")
            values.append(val)
        i += 1

    set_parts.append("updated_at = NOW()")
    # col is a Pydantic field name from model_dump(), not user input — not a SQL injection risk
    async with conn.transaction():
        await conn.execute(
            f"UPDATE effects SET {', '.join(set_parts)} WHERE effect_id = $1",
            effect_id, *values,
        )
        new_row = await conn.fetchrow(_SELECT_ONE, effect_id)
        await log_audit(conn, "effects", effect_id, "UPDATE",
                        performed_by=user.username,
                        old_data=_serializable(dict(old_row)),
                        new_data=_serializable(dict(new_row)))
    return await get_effect(effect_id, conn)


@router.get("/{effect_id}/history", responses={401: {"description": "Unauthorized"}})
async def get_effect_history(
    effect_id: UUID,
    _current_user: Annotated[UserOut, Depends(get_current_user)],
    conn: Annotated[Connection, Depends(get_conn)],
) -> list[AuditEntryWithData]:
    return await get_history(conn, _CONFIG, effect_id)


@router.delete("/{effect_id}", status_code=204, responses={404: {"description": "Not found"}, 409: {"description": "Conflict"}})
async def delete_effect(effect_id: UUID, conn: Annotated[Connection, Depends(get_conn)], user: Annotated[UserOut, Depends(require_admin)]):
    return await delete_entity(conn, _CONFIG, effect_id, user)
