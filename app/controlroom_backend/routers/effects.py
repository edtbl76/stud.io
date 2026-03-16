import json
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from asyncpg import Connection

from database import get_conn
from routers.auth import require_admin, UserOut
from schemas.effects import EffectCreate, EffectUpdate, EffectOut
from routers._helpers import parent_ref_sql, encode_parent_refs

router = APIRouter()

_SELECT = "SELECT * FROM effects_view"
_PARENT_REF_TABLES = ["effects", "instruments", "libraries"]


@router.get("", response_model=list[EffectOut])
async def list_effects(q: str | None = None, *, conn: Annotated[Connection, Depends(get_conn)]):
    if q:
        rows = await conn.fetch(
            _SELECT + " WHERE effect_name ILIKE $1 OR brand_name ILIKE $1", f"%{q}%"
        )
    else:
        rows = await conn.fetch(_SELECT)
    return [EffectOut(**dict(r)) for r in rows]


@router.get("/{effect_id}", response_model=EffectOut)
async def get_effect(effect_id: UUID, conn: Annotated[Connection, Depends(get_conn)]):
    row = await conn.fetchrow(_SELECT + " WHERE effect_id = $1", effect_id)
    if not row:
        raise HTTPException(status_code=404, detail="Effect not found")
    return EffectOut(**dict(row))


@router.post("", response_model=EffectOut, status_code=201)
async def create_effect(payload: EffectCreate, conn: Annotated[Connection, Depends(get_conn)], _: Annotated[UserOut, Depends(require_admin)]):
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
    return await get_effect(row["effect_id"], conn)


@router.patch("/{effect_id}", response_model=EffectOut)
async def update_effect(effect_id: UUID, payload: EffectUpdate, conn: Annotated[Connection, Depends(get_conn)], _: Annotated[UserOut, Depends(require_admin)]):
    if not await conn.fetchrow("SELECT 1 FROM effects WHERE effect_id = $1", effect_id):
        raise HTTPException(status_code=404, detail="Effect not found")

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
    await conn.execute(
        f"UPDATE effects SET {', '.join(set_parts)} WHERE effect_id = $1",
        effect_id, *values,
    )
    return await get_effect(effect_id, conn)


@router.delete("/{effect_id}", status_code=204)
async def delete_effect(effect_id: UUID, conn: Annotated[Connection, Depends(get_conn)], _: Annotated[UserOut, Depends(require_admin)]):
    if not await conn.fetchrow("SELECT 1 FROM effects WHERE effect_id = $1", effect_id):
        raise HTTPException(status_code=404, detail="Effect not found")

    for table in _PARENT_REF_TABLES:
        if await conn.fetchrow(
            f"SELECT 1 FROM {table} WHERE EXISTS "
            f"(SELECT 1 FROM unnest(parent_ids) p WHERE (p).id = $1) LIMIT 1",
            effect_id,
        ):
            raise HTTPException(status_code=409, detail=f"Effect is referenced as a parent in {table}")

    await conn.execute("DELETE FROM effects WHERE effect_id = $1", effect_id)
