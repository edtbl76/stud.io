import json
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from asyncpg import Connection

from database import get_conn
from routers.auth import require_admin, UserOut
from schemas.models import ModelCreate, ModelUpdate, ModelOut

router = APIRouter()

_SELECT = "SELECT * FROM models_view"
_NOT_FOUND = "Model not found"

_REF_CHECKS = [
    ("effects",           "model_ids"),
    ("instruments",       "model_ids"),
    ("libraries",         "model_ids"),
    ("measurement_tools", "model_ids"),
    ("reference_tools",   "model_ids"),
]


@router.get("", response_model=list[ModelOut])
async def list_models(q: str | None = None, *, conn: Annotated[Connection, Depends(get_conn)]):
    if q:
        rows = await conn.fetch(
            _SELECT + " WHERE model_name ILIKE $1 OR brand_name ILIKE $1", f"%{q}%"
        )
    else:
        rows = await conn.fetch(_SELECT)
    return [ModelOut(**dict(r)) for r in rows]


@router.get("/{model_id}", response_model=ModelOut, responses={404: {"description": "Not found"}})
async def get_model(model_id: UUID, conn: Annotated[Connection, Depends(get_conn)]):
    row = await conn.fetchrow(_SELECT + " WHERE model_id = $1", model_id)
    if not row:
        raise HTTPException(status_code=404, detail=_NOT_FOUND)
    return ModelOut(**dict(row))


@router.post("", response_model=ModelOut, status_code=201)
async def create_model(payload: ModelCreate, conn: Annotated[Connection, Depends(get_conn)], _: Annotated[UserOut, Depends(require_admin)]):
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
    return await get_model(row["model_id"], conn)


@router.patch("/{model_id}", response_model=ModelOut, responses={404: {"description": "Not found"}})
async def update_model(model_id: UUID, payload: ModelUpdate, conn: Annotated[Connection, Depends(get_conn)], _: Annotated[UserOut, Depends(require_admin)]):
    if not await conn.fetchrow("SELECT 1 FROM models WHERE model_id = $1", model_id):
        raise HTTPException(status_code=404, detail=_NOT_FOUND)

    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        return await get_model(model_id, conn)

    if "attributes" in updates and updates["attributes"] is not None:
        updates["attributes"] = json.dumps(updates["attributes"])

    set_clauses = ", ".join(f"{col} = ${i+2}" for i, col in enumerate(updates))
    await conn.execute(
        f"UPDATE models SET {set_clauses}, updated_at = NOW() WHERE model_id = $1",
        model_id, *updates.values(),
    )
    return await get_model(model_id, conn)


@router.delete("/{model_id}", status_code=204, responses={404: {"description": "Not found"}, 409: {"description": "Conflict"}})
async def delete_model(model_id: UUID, conn: Annotated[Connection, Depends(get_conn)], _: Annotated[UserOut, Depends(require_admin)]):
    if not await conn.fetchrow("SELECT 1 FROM models WHERE model_id = $1", model_id):
        raise HTTPException(status_code=404, detail=_NOT_FOUND)

    for table, col in _REF_CHECKS:
        if await conn.fetchrow(f"SELECT 1 FROM {table} WHERE $1 = ANY({col}) LIMIT 1", model_id):
            raise HTTPException(status_code=409, detail=f"Model is referenced by {table}")

    await conn.execute("DELETE FROM models WHERE model_id = $1", model_id)
