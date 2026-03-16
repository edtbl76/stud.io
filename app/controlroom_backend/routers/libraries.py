import json
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from asyncpg import Connection

from database import get_conn
from routers.auth import require_admin, UserOut
from schemas.libraries import LibraryCreate, LibraryUpdate, LibraryOut
from routers._helpers import parent_ref_sql, encode_parent_refs

router = APIRouter()

_SELECT = "SELECT * FROM libraries_view"
_PARENT_REF_TABLES = ["effects", "instruments", "libraries"]


@router.get("", response_model=list[LibraryOut])
async def list_libraries(q: str | None = None, conn: Connection = Depends(get_conn)):
    if q:
        rows = await conn.fetch(
            _SELECT + " WHERE library_name ILIKE $1 OR brand_name ILIKE $1", f"%{q}%"
        )
    else:
        rows = await conn.fetch(_SELECT)
    return [LibraryOut(**dict(r)) for r in rows]


@router.get("/{library_id}", response_model=LibraryOut)
async def get_library(library_id: UUID, conn: Connection = Depends(get_conn)):
    row = await conn.fetchrow(_SELECT + " WHERE library_id = $1", library_id)
    if not row:
        raise HTTPException(status_code=404, detail="Library not found")
    return LibraryOut(**dict(row))


@router.post("", response_model=LibraryOut, status_code=201)
async def create_library(payload: LibraryCreate, conn: Connection = Depends(get_conn), _: UserOut = Depends(require_admin)):
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
    return await get_library(row["library_id"], conn)


@router.patch("/{library_id}", response_model=LibraryOut)
async def update_library(library_id: UUID, payload: LibraryUpdate, conn: Connection = Depends(get_conn), _: UserOut = Depends(require_admin)):
    if not await conn.fetchrow("SELECT 1 FROM libraries WHERE library_id = $1", library_id):
        raise HTTPException(status_code=404, detail="Library not found")

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
    await conn.execute(
        f"UPDATE libraries SET {', '.join(set_parts)} WHERE library_id = $1",
        library_id, *values,
    )
    return await get_library(library_id, conn)


@router.delete("/{library_id}", status_code=204)
async def delete_library(library_id: UUID, conn: Connection = Depends(get_conn), _: UserOut = Depends(require_admin)):
    if not await conn.fetchrow("SELECT 1 FROM libraries WHERE library_id = $1", library_id):
        raise HTTPException(status_code=404, detail="Library not found")

    for table in _PARENT_REF_TABLES:
        if await conn.fetchrow(
            f"SELECT 1 FROM {table} WHERE EXISTS "
            f"(SELECT 1 FROM unnest(parent_ids) p WHERE (p).id = $1) LIMIT 1",
            library_id,
        ):
            raise HTTPException(status_code=409, detail=f"Library is referenced as a parent in {table}")

    await conn.execute("DELETE FROM libraries WHERE library_id = $1", library_id)
