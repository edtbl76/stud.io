from contextlib import asynccontextmanager
from typing import Annotated
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from asyncpg import Connection

from config import settings
from database import init_pool, close_pool, get_conn
from routers import brands, models, effects, instruments, libraries
from routers import workstations, tools, config as config_router, search, auth, users
from routers import backup_ops, change_review, admin_stats, import_export
from routers.auth import seed_default_admin


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_pool()
    from database import _pool
    async with _pool.acquire() as conn:
        await seed_default_admin(conn)
    yield
    await close_pool()


app = FastAPI(title="STUD.io ControlRoom API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://localhost:2112"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,          prefix="/auth",         tags=["auth"])
app.include_router(search.router,        prefix="/search",       tags=["search"])
app.include_router(brands.router,        prefix="/studio/catalog/brands",  tags=["brands"])
app.include_router(models.router,        prefix="/studio/catalog/models",  tags=["models"])
app.include_router(effects.router,       prefix="/studio/session/effects",      tags=["effects"])
app.include_router(instruments.router,   prefix="/studio/session/instruments",  tags=["instruments"])
app.include_router(libraries.router,     prefix="/studio/session/libraries",    tags=["libraries"])
app.include_router(workstations.router,  prefix="/studio/session/workstations", tags=["workstations"])
app.include_router(tools.router,         prefix="/studio/tools",                tags=["tools"])
app.include_router(config_router.router, prefix="/studio/config",               tags=["config"])
ADMIN_PREFIX = "/studio/admin"
app.include_router(backup_ops.router,    prefix=ADMIN_PREFIX, tags=["admin"])
app.include_router(change_review.router, prefix=ADMIN_PREFIX, tags=["admin"])
app.include_router(admin_stats.router,     prefix=ADMIN_PREFIX, tags=["admin"])
app.include_router(import_export.router,  prefix=ADMIN_PREFIX, tags=["admin"])
app.include_router(users.router,        prefix="/studio/admin/users", tags=["users"])


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/health/ready")
async def health_ready(conn: Annotated[Connection, Depends(get_conn)]):
    await conn.fetchval("SELECT 1")
    return {"status": "ready"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=settings.app_host, port=settings.app_port, reload=True)
