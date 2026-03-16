import asyncpg
from contextlib import asynccontextmanager
from config import settings

_pool: asyncpg.Pool | None = None


async def init_pool():
    global _pool
    _pool = await asyncpg.create_pool(
        dsn=settings.db_dsn,
        min_size=2,
        max_size=10,
    )


async def close_pool():
    global _pool
    if _pool:
        await _pool.close()
        _pool = None


@asynccontextmanager
async def get_conn():
    async with _pool.acquire() as conn:
        yield conn
