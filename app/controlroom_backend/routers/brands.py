from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from asyncpg import Connection

from database import get_conn
from routers._crud_ops import EntityConfig, list_entities, get_entity, get_history, delete_entity, parse_filters
from routers.filter_operators import FilterableField, FilterEntry
from routers.auth import require_admin, get_current_user, UserOut
from schemas.brands import BrandCreate, BrandUpdate, BrandOut
from schemas.common import PagedResponse, ListParams
from routers._helpers import _serializable, log_audit, AuditEntryWithData

router = APIRouter()

_SELECT_ONE = "SELECT * FROM brands WHERE brand_id = $1"
_NOT_FOUND = "Brand not found"
_REF_TABLES = ["models"]
_SORTABLE = frozenset({"brand_name", "legal_name", "entity_type_name", "created_at", "updated_at"})
_DEFAULT_SORT = "brand_name"
_FILTERABLE: dict[str, FilterableField] = {
    "name":        FilterableField("brand_name ILIKE {val} OR legal_name ILIKE {val}", col_expr="brand_name"),
    "brand_name":  FilterableField("brand_name ILIKE {val}",       col_expr="brand_name"),
    "legal_name":  FilterableField("legal_name ILIKE {val}",       col_expr="legal_name"),
    "entity_type": FilterableField("entity_type_name ILIKE {val}", col_expr="entity_type_name"),
    "created_at":  FilterableField(col_expr="created_at"),
    "updated_at":  FilterableField(col_expr="updated_at"),
}


async def _check_brand_refs(conn: Connection, brand_id: UUID) -> None:
    for table in _REF_TABLES:
        if await conn.fetchrow(
            f"SELECT 1 FROM {table} WHERE brand_id = $1 AND deleted_at IS NULL LIMIT 1", brand_id
        ):
            raise HTTPException(
                status_code=409,
                detail=f"Brand is referenced by {table} and cannot be deleted",
            )


_CONFIG = EntityConfig(
    table_name="brands",
    view_name="brands_view",
    id_column="brand_id",
    not_found_msg=_NOT_FOUND,
    search_where="",  # deprecated
    sortable=_SORTABLE,
    default_sort=_DEFAULT_SORT,
    ref_check=_check_brand_refs,
    filterable=_FILTERABLE,
)


@router.get("", response_model=PagedResponse[BrandOut])
async def list_brands(
    params: Annotated[ListParams, Depends()],
    conn: Annotated[Connection, Depends(get_conn)],
    filters: Annotated[dict[str, FilterEntry], Depends(parse_filters)],
):
    return await list_entities(conn, _CONFIG, params, BrandOut, filters)


@router.get("/{brand_id}", response_model=BrandOut, responses={404: {"description": "Not found"}})
async def get_brand(brand_id: UUID, conn: Annotated[Connection, Depends(get_conn)]):
    return await get_entity(conn, _CONFIG, brand_id, BrandOut)


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


@router.get("/{brand_id}/history", responses={401: {"description": "Unauthorized"}})
async def get_brand_history(
    brand_id: UUID,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    conn: Annotated[Connection, Depends(get_conn)],
) -> list[AuditEntryWithData]:
    return await get_history(conn, _CONFIG, brand_id)


@router.delete("/{brand_id}", status_code=204, responses={404: {"description": "Not found"}, 409: {"description": "Conflict"}})
async def delete_brand(brand_id: UUID, conn: Annotated[Connection, Depends(get_conn)], user: Annotated[UserOut, Depends(require_admin)]):
    return await delete_entity(conn, _CONFIG, brand_id, user)
