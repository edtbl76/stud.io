from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from asyncpg import Connection

from database import get_conn
from routers.auth import require_admin, UserOut
from schemas.brands import BrandCreate, BrandUpdate, BrandOut
from routers._helpers import _serializable, log_audit

router = APIRouter()

_SELECT = "SELECT * FROM brands_view"
_SELECT_ONE = "SELECT * FROM brands WHERE brand_id = $1"
_NOT_FOUND = "Brand not found"
_REF_TABLES = ["models"]


def _row_to_out(row) -> BrandOut:
    return BrandOut(**dict(row))


@router.get("", response_model=list[BrandOut])
async def list_brands(q: str | None = None, *, conn: Annotated[Connection, Depends(get_conn)]):
    if q:
        rows = await conn.fetch(
            _SELECT + " WHERE brand_name ILIKE $1 OR legal_name ILIKE $1", f"%{q}%"
        )
    else:
        rows = await conn.fetch(_SELECT)
    return [_row_to_out(r) for r in rows]


@router.get("/{brand_id}", response_model=BrandOut, responses={404: {"description": "Not found"}})
async def get_brand(brand_id: UUID, conn: Annotated[Connection, Depends(get_conn)]):
    row = await conn.fetchrow(_SELECT + " WHERE brand_id = $1", brand_id)
    if not row:
        raise HTTPException(status_code=404, detail=_NOT_FOUND)  # NOSONAR
    return _row_to_out(row)


@router.post("", response_model=BrandOut, status_code=201)
async def create_brand(payload: BrandCreate, conn: Annotated[Connection, Depends(get_conn)], user: Annotated[UserOut, Depends(require_admin)]):
    async with conn.transaction():
        row = await conn.fetchrow(
            """
            INSERT INTO brands (legal_name, brand_name, entity_type_id, website,
                                description, founder, years)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING brand_id
            """,
            payload.legal_name, payload.brand_name, payload.entity_type_id,
            payload.website, payload.description, payload.founder, payload.years,
        )
        new_row = await conn.fetchrow(_SELECT_ONE, row["brand_id"])
        await log_audit(conn, "brands", row["brand_id"], "CREATE",
                        performed_by=user.username, new_data=_serializable(dict(new_row)))
    return await get_brand(row["brand_id"], conn)


@router.patch("/{brand_id}", response_model=BrandOut, responses={404: {"description": "Not found"}, 409: {"description": "Conflict"}})
async def update_brand(brand_id: UUID, payload: BrandUpdate, conn: Annotated[Connection, Depends(get_conn)], user: Annotated[UserOut, Depends(require_admin)]):
    old_row = await conn.fetchrow(_SELECT_ONE, brand_id)
    if not old_row:
        raise HTTPException(status_code=404, detail=_NOT_FOUND)
    if old_row["deleted_at"] is not None:
        raise HTTPException(status_code=409, detail="Cannot update a deleted record")

    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        return await get_brand(brand_id, conn)

    set_clauses = ", ".join(f"{col} = ${i + 2}" for i, col in enumerate(updates))
    values = list(updates.values())
    async with conn.transaction():
        await conn.execute(
            f"UPDATE brands SET {set_clauses}, updated_at = NOW() WHERE brand_id = $1",
            brand_id, *values,
        )
        new_row = await conn.fetchrow(_SELECT_ONE, brand_id)
        await log_audit(conn, "brands", brand_id, "UPDATE",
                        performed_by=user.username,
                        old_data=_serializable(dict(old_row)),
                        new_data=_serializable(dict(new_row)))
    return await get_brand(brand_id, conn)


@router.delete("/{brand_id}", status_code=204, responses={404: {"description": "Not found"}, 409: {"description": "Conflict"}})
async def delete_brand(brand_id: UUID, conn: Annotated[Connection, Depends(get_conn)], user: Annotated[UserOut, Depends(require_admin)]):
    row = await conn.fetchrow(_SELECT_ONE, brand_id)
    if not row:
        raise HTTPException(status_code=404, detail=_NOT_FOUND)
    if row["deleted_at"] is not None:
        return JSONResponse(
            status_code=200,
            content={"detail": "Record is already deleted. To permanently remove it, use Change Review."}
        )

    for table in _REF_TABLES:
        if await conn.fetchrow(
            f"SELECT 1 FROM {table} WHERE brand_id = $1 AND deleted_at IS NULL LIMIT 1", brand_id
        ):
            raise HTTPException(
                status_code=409,
                detail=f"Brand is referenced by {table} and cannot be deleted",
            )

    async with conn.transaction():
        await conn.execute("UPDATE brands SET deleted_at = NOW() WHERE brand_id = $1", brand_id)
        await log_audit(conn, "brands", brand_id, "DELETE",
                        performed_by=user.username, old_data=_serializable(dict(row)))
