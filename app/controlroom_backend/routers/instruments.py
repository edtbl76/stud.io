import json
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from asyncpg import Connection

from database import get_conn
from routers.auth import require_admin, get_current_user, UserOut
from schemas.instruments import InstrumentCreate, InstrumentUpdate, InstrumentOut
from routers._helpers import parent_ref_sql, encode_parent_refs, _serializable, log_audit, get_record_history, AuditEntryWithData

router = APIRouter()

_SELECT = "SELECT * FROM instruments_view"
_SELECT_ONE = "SELECT * FROM instruments WHERE instrument_id = $1"
_NOT_FOUND = "Instrument not found"
_PARENT_REF_TABLES = ["effects", "instruments", "libraries"]


@router.get("", response_model=list[InstrumentOut])
async def list_instruments(q: str | None = None, *, conn: Annotated[Connection, Depends(get_conn)]):
    if q:
        rows = await conn.fetch(
            _SELECT + " WHERE instrument_name ILIKE $1 OR brand_name ILIKE $1", f"%{q}%"
        )
    else:
        rows = await conn.fetch(_SELECT)
    return [InstrumentOut(**dict(r)) for r in rows]


@router.get("/{instrument_id}", response_model=InstrumentOut, responses={404: {"description": "Not found"}})
async def get_instrument(instrument_id: UUID, conn: Annotated[Connection, Depends(get_conn)]):
    row = await conn.fetchrow(_SELECT + " WHERE instrument_id = $1", instrument_id)
    if not row:
        raise HTTPException(status_code=404, detail=_NOT_FOUND)  # NOSONAR
    return InstrumentOut(**dict(row))


@router.post("", response_model=InstrumentOut, status_code=201)
async def create_instrument(payload: InstrumentCreate, conn: Annotated[Connection, Depends(get_conn)], user: Annotated[UserOut, Depends(require_admin)]):
    async with conn.transaction():
        row = await conn.fetchrow(
            f"""
            INSERT INTO instruments
                (instrument_name, brand_id, model_ids, version,
                 instrument_type_ids, tool_type_ids, plugin_format_ids,
                 description, instrument_notes, recording_notes,
                 attributes, tag_ids, parent_ids)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
                    {parent_ref_sql('$13')})
            RETURNING instrument_id
            """,
            payload.instrument_name, payload.brand_id, payload.model_ids,
            payload.version,
            payload.instrument_type_ids, payload.tool_type_ids, payload.plugin_format_ids,
            payload.description, payload.instrument_notes, payload.recording_notes,
            json.dumps(payload.attributes) if payload.attributes is not None else None,
            payload.tag_ids,
            encode_parent_refs(payload.parent_ids),
        )
        new_row = await conn.fetchrow(_SELECT_ONE, row["instrument_id"])
        await log_audit(conn, "instruments", row["instrument_id"], "CREATE",
                        performed_by=user.username, new_data=_serializable(dict(new_row)))
    return await get_instrument(row["instrument_id"], conn)


@router.patch("/{instrument_id}", response_model=InstrumentOut, responses={404: {"description": "Not found"}, 409: {"description": "Conflict"}})
async def update_instrument(instrument_id: UUID, payload: InstrumentUpdate, conn: Annotated[Connection, Depends(get_conn)], user: Annotated[UserOut, Depends(require_admin)]):
    old_row = await conn.fetchrow(_SELECT_ONE, instrument_id)
    if not old_row:
        raise HTTPException(status_code=404, detail=_NOT_FOUND)
    if old_row["deleted_at"] is not None:
        raise HTTPException(status_code=409, detail="Cannot update a deleted record")

    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        return await get_instrument(instrument_id, conn)

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
    async with conn.transaction():
        await conn.execute(
            f"UPDATE instruments SET {', '.join(set_parts)} WHERE instrument_id = $1",
            instrument_id, *values,
        )
        new_row = await conn.fetchrow(_SELECT_ONE, instrument_id)
        await log_audit(conn, "instruments", instrument_id, "UPDATE",
                        performed_by=user.username,
                        old_data=_serializable(dict(old_row)),
                        new_data=_serializable(dict(new_row)))
    return await get_instrument(instrument_id, conn)


@router.get("/{instrument_id}/history", responses={401: {"description": "Unauthorized"}})
async def get_instrument_history(
    instrument_id: UUID,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    conn: Annotated[Connection, Depends(get_conn)],
) -> list[AuditEntryWithData]:
    return await get_record_history(conn, "instruments", instrument_id)


@router.delete("/{instrument_id}", status_code=204, responses={404: {"description": "Not found"}, 409: {"description": "Conflict"}})
async def delete_instrument(instrument_id: UUID, conn: Annotated[Connection, Depends(get_conn)], user: Annotated[UserOut, Depends(require_admin)]):
    row = await conn.fetchrow(_SELECT_ONE, instrument_id)
    if not row:
        raise HTTPException(status_code=404, detail=_NOT_FOUND)
    if row["deleted_at"] is not None:
        return JSONResponse(
            status_code=200,
            content={"detail": "Record is already deleted. To permanently remove it, use Change Review."}
        )

    for table in _PARENT_REF_TABLES:
        if await conn.fetchrow(
            f"SELECT 1 FROM {table} WHERE deleted_at IS NULL AND EXISTS "
            f"(SELECT 1 FROM unnest(parent_ids) p WHERE (p).id = $1) LIMIT 1",
            instrument_id,
        ):
            raise HTTPException(status_code=409, detail=f"Instrument is referenced as a parent in {table}")

    async with conn.transaction():
        await conn.execute("UPDATE instruments SET deleted_at = NOW() WHERE instrument_id = $1", instrument_id)
        await log_audit(conn, "instruments", instrument_id, "DELETE",
                        performed_by=user.username, old_data=_serializable(dict(row)))
