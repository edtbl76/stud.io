from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from asyncpg import Connection

from database import get_conn
from routers.auth import require_admin, UserOut
from schemas.brands import BrandCreate, BrandUpdate, BrandOut

router = APIRouter()

_SELECT = "SELECT * FROM brands_view"

# Tables that may reference brands
_REF_TABLES = ["models"]


def _row_to_out(row) -> BrandOut:
    return BrandOut(**dict(row))


@router.get("", response_model=list[BrandOut])
async def list_brands(q: str | None = None, conn: Connection = Depends(get_conn)):
    if q:
        rows = await conn.fetch(
            _SELECT + " WHERE brand_name ILIKE $1 OR legal_name ILIKE $1",
            f"%{q}%",
        )
    else:
        rows = await conn.fetch(_SELECT)
    return [_row_to_out(r) for r in rows]


@router.get("/{brand_id}", response_model=BrandOut)
async def get_brand(brand_id: UUID, conn: Connection = Depends(get_conn)):
    row = await conn.fetchrow(_SELECT + " WHERE brand_id = $1", brand_id)
    if not row:
        raise HTTPException(status_code=404, detail="Brand not found")
    return _row_to_out(row)


@router.post("", response_model=BrandOut, status_code=201)
async def create_brand(payload: BrandCreate, conn: Connection = Depends(get_conn), _: UserOut = Depends(require_admin)):
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
    return await get_brand(row["brand_id"], conn)


@router.patch("/{brand_id}", response_model=BrandOut)
async def update_brand(brand_id: UUID, payload: BrandUpdate, conn: Connection = Depends(get_conn), _: UserOut = Depends(require_admin)):
    existing = await conn.fetchrow("SELECT 1 FROM brands WHERE brand_id = $1", brand_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Brand not found")

    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        return await get_brand(brand_id, conn)

    set_clauses = ", ".join(f"{col} = ${i + 2}" for i, col in enumerate(updates))
    values = list(updates.values())
    await conn.execute(
        f"UPDATE brands SET {set_clauses}, updated_at = NOW() WHERE brand_id = $1",
        brand_id, *values,
    )
    return await get_brand(brand_id, conn)


@router.delete("/{brand_id}", status_code=204)
async def delete_brand(brand_id: UUID, conn: Connection = Depends(get_conn), _: UserOut = Depends(require_admin)):
    existing = await conn.fetchrow("SELECT 1 FROM brands WHERE brand_id = $1", brand_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Brand not found")

    for table in _REF_TABLES:
        ref = await conn.fetchrow(
            f"SELECT 1 FROM {table} WHERE brand_id = $1 LIMIT 1", brand_id
        )
        if ref:
            raise HTTPException(
                status_code=409,
                detail=f"Brand is referenced by {table} and cannot be deleted",
            )

    await conn.execute("DELETE FROM brands WHERE brand_id = $1", brand_id)
