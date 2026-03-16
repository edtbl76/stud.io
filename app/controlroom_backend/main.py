from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from database import init_pool, close_pool
from routers import brands, models, effects, instruments, libraries
from routers import workstations, tools, config as config_router, search, auth


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_pool()
    yield
    await close_pool()


app = FastAPI(title="STUD.io ControlRoom API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:2112"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,          prefix="/auth",         tags=["auth"])
app.include_router(search.router,        prefix="/search",       tags=["search"])
app.include_router(brands.router,        prefix="/brands",       tags=["brands"])
app.include_router(models.router,        prefix="/models",       tags=["models"])
app.include_router(effects.router,       prefix="/effects",      tags=["effects"])
app.include_router(instruments.router,   prefix="/instruments",  tags=["instruments"])
app.include_router(libraries.router,     prefix="/libraries",    tags=["libraries"])
app.include_router(workstations.router,  prefix="/workstations", tags=["workstations"])
app.include_router(tools.router,         prefix="/tools",        tags=["tools"])
app.include_router(config_router.router, prefix="/config",       tags=["config"])


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=settings.app_host, port=settings.app_port, reload=True)
