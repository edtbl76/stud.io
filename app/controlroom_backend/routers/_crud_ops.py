from dataclasses import dataclass
from typing import Callable, Awaitable
from uuid import UUID

from asyncpg import Connection
from fastapi import HTTPException
from fastapi.responses import JSONResponse

from routers._helpers import (
    AuditEntryWithData,
    get_record_history,
    _serializable,
    log_audit,
)
from routers.auth import UserOut

from schemas.common import ListParams, PagedResponse

@dataclass
class EntityConfig:
    """ Static, defined once per router """
    table_name: str
    view_name: str
    id_column: str
    search_where: str
    sortable: frozenset[str]
    default_sort: str
    not_found_msg: str
    ref_check: Callable[[Connection, UUID], Awaitable[None]] | None = None


# noinspection SqlInjection
async def list_entities(conn: Connection, config: EntityConfig, params: ListParams, model_cls: type):
    """ List entities from a database, with optional filtering and sorting """
    col = params.sort_by if params.sort_by in config.sortable else config.default_sort
    direction = "DESC" if params.sort_dir.lower() == "desc" else "ASC"
    order = f"ORDER BY {col} {direction}"

    if params.q:
        where = f"WHERE ({config.search_where})"
        total = await conn.fetchval(f"SELECT COUNT(*) FROM {config.view_name} {where}", f"%{params.q}%")
        rows = await conn.fetch(f"SELECT * FROM {config.view_name} {where} {order} LIMIT $2 OFFSET $3",
                                f"%{params.q}%",
                                params.limit, params.offset)
    else:
        total = await conn.fetchval(f"SELECT COUNT(*) FROM {config.view_name}")
        rows = await conn.fetch(f"SELECT * FROM {config.view_name} {order} LIMIT $1 OFFSET $2",
                                params.limit, params.offset)

    return PagedResponse(items=[model_cls(**dict(r)) for r in rows], total=total)

# noinspection SqlInjection
async def get_entity(conn: Connection, config: EntityConfig, entity_id: UUID, model_cls: type):
    """ Get a single entity by ID, or raise 404 if not found """
    row = await conn.fetchrow(f"SELECT * FROM {config.view_name} WHERE {config.id_column} = $1", entity_id)
    if not row:
        raise HTTPException(status_code=404, detail=config.not_found_msg)  # NOSONAR
    return model_cls(**dict(row))


_PARENT_REF_TABLES = ["effects", "instruments", "libraries"]


# noinspection SqlInjection
async def check_parent_refs(conn: Connection, entity_id: UUID, entity_label: str) -> None:
    """Raise 409 if entity_id is referenced as a parent in any of the three parent-ref tables."""
    for table in _PARENT_REF_TABLES:
        if await conn.fetchrow(
            f"SELECT 1 FROM {table} WHERE deleted_at IS NULL AND EXISTS "
            f"(SELECT 1 FROM unnest(parent_ids) p WHERE (p).id = $1) LIMIT 1",
            entity_id,
        ):
            raise HTTPException(
                status_code=409,
                detail=f"{entity_label} is referenced as a parent in {table}",
            )


async def get_history(conn: Connection, config: EntityConfig, entity_id: UUID) -> list[AuditEntryWithData]:
    return await get_record_history(conn, config.table_name, entity_id)


# noinspection SqlInjection
async def delete_entity(conn: Connection, config: EntityConfig, entity_id: UUID, user: UserOut):
    """ Delete an entity by ID, or raise 404 if not found """
    row = await conn.fetchrow(f"SELECT * FROM {config.table_name} WHERE {config.id_column} = $1", entity_id)
    if not row:
        raise HTTPException(status_code=404, detail=config.not_found_msg)

    if row["deleted_at"] is not None:
        return JSONResponse(
            status_code=200,
            content={"detail": "Record is already deleted. To permanently remove it, use Change Review."}
        )

    if config.ref_check:
        await config.ref_check(conn, entity_id)

    async with conn.transaction():
        await conn.execute(f"UPDATE {config.table_name} SET deleted_at = NOW() WHERE {config.id_column} = $1",
                           entity_id)
        await log_audit(conn, config.table_name, entity_id, "DELETE",
                        performed_by=user.username,
                        old_data=_serializable(dict(row)))
