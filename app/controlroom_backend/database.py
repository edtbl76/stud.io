import json
import asyncpg
from config import settings

_pool: asyncpg.Pool | None = None


async def _init_conn(conn: asyncpg.Connection) -> None:
    """Register JSON/JSONB codecs so columns come back as Python objects."""
    await conn.set_type_codec("json",  encoder=json.dumps, decoder=json.loads, schema="pg_catalog")
    await conn.set_type_codec("jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog")


async def init_pool():
    global _pool
    _pool = await asyncpg.create_pool(
        dsn=settings.db_dsn,
        min_size=2,
        max_size=10,
        init=_init_conn,
    )


async def close_pool():
    global _pool
    if _pool:
        await _pool.close()
        _pool = None


async def get_conn():
    """FastAPI dependency — yields a pooled connection."""
    async with _pool.acquire() as conn:
        yield conn
