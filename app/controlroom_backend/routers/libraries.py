import json
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from asyncpg import Connection

from database import get_conn
from routers.auth import require_admin, get_current_user, UserOut
from schemas.libraries import LibraryCreate, LibraryUpdate, LibraryOut
from routers._helpers import parent_ref_sql, encode_parent_refs, _serializable, log_audit, get_record_history, AuditEntryWithData

router = APIRouter()

_SELECT = "SELECT * FROM libraries_view"
_SELECT_ONE = "SELECT * FROM libraries WHERE library_id = $1"
_NOT_FOUND = "Library not found"
_PARENT_REF_TABLES = ["effects", "instruments", "libraries"]


@router.get("", response_model=list[LibraryOut])
async def list_libraries(q: str | None = None, *, conn: Annotated[Connection, Depends(get_conn)]):
    if q:
        rows = await conn.fetch(
            _SELECT + " WHERE library_name ILIKE $1 OR brand_name ILIKE $1", f"%{q}%"
        )
    else:
        rows = await conn.fetch(_SELECT)
    return [LibraryOut(**dict(r)) for r in rows]


@router.get("/{library_id}", response_model=LibraryOut, responses={404: {"description": "Not found"}})
async def get_library(library_id: UUID, conn: Annotated[Connection, Depends(get_conn)]):
    row = await conn.fetchrow(_SELECT + " WHERE library_id = $1", library_id)
    if not row:
        raise HTTPException(status_code=404, detail=_NOT_FOUND)  # NOSONAR
    return LibraryOut(**dict(row))


@router.post("", response_model=LibraryOut, status_code=201)
async def create_library(payload: LibraryCreate, conn: Annotated[Connection, Depends(get_conn)], user: Annotated[UserOut, Depends(require_admin)]):
    async with conn.transaction():
        row = await conn.fetchrow(
            f"""
            INSERT INTO libraries
                (library_name, brand_id, model_ids, description,
                 instrument_notes, recording_notes, tag_ids, attributes, parent_ids)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,
                    {parent_ref_sql('$9')})
            RETURNING library_id
            """,
            payload.library_name, payload.brand_id, payload.model_ids,
            payload.description, payload.instrument_notes, payload.recording_notes,
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
    current_user: Annotated[UserOut, Depends(get_current_user)],
    conn: Annotated[Connection, Depends(get_conn)],
) -> list[AuditEntryWithData]:
    return await get_record_history(conn, "libraries", library_id)


@router.delete("/{library_id}", status_code=204, responses={404: {"description": "Not found"}, 409: {"description": "Conflict"}})
async def delete_library(library_id: UUID, conn: Annotated[Connection, Depends(get_conn)], user: Annotated[UserOut, Depends(require_admin)]):
    row = await conn.fetchrow(_SELECT_ONE, library_id)
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
            library_id,
        ):
            raise HTTPException(status_code=409, detail=f"Library is referenced as a parent in {table}")

    async with conn.transaction():
        await conn.execute("UPDATE libraries SET deleted_at = NOW() WHERE library_id = $1", library_id)
        await log_audit(conn, "libraries", library_id, "DELETE",
                        performed_by=user.username, old_data=_serializable(dict(row)))
