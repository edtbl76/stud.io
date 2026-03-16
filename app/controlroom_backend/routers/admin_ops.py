import asyncio
import os
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse

from config import settings
from routers.auth import require_admin, UserOut

router = APIRouter()


def _pg_env() -> dict:
    env = os.environ.copy()
    env["PGPASSWORD"] = settings.db_password
    return env


def _pg_args(command: str) -> list[str]:
    return [
        command,
        "-h", settings.db_host,
        "-p", str(settings.db_port),
        "-U", settings.db_user,
        settings.db_name,
    ]


@router.get("/backup", responses={500: {"description": "Internal server error"}})
async def backup(_: Annotated[UserOut, Depends(require_admin)]):
    """Dump controlroomdb to a SQL file and return it as a download."""
    proc = await asyncio.create_subprocess_exec(
        *(_pg_args("pg_dump") + ["--clean", "--if-exists"]),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=_pg_env(),
    )
    stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise HTTPException(status_code=500, detail=stderr.decode())

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"controlroomdb_{timestamp}.sql"

    return StreamingResponse(
        iter([stdout]),
        media_type="application/octet-stream",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.post("/restore", responses={400: {"description": "Bad request"}, 500: {"description": "Internal server error"}})
async def restore(file: Annotated[UploadFile, File(...)], _: Annotated[UserOut, Depends(require_admin)]):
    """Restore controlroomdb from an uploaded SQL file."""
    if not file.filename or not file.filename.endswith(".sql"):
        raise HTTPException(status_code=400, detail="File must be a .sql file")

    sql_bytes = await file.read()

    proc = await asyncio.create_subprocess_exec(
        *_pg_args("psql"),
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=_pg_env(),
    )
    _, stderr = await proc.communicate(input=sql_bytes)
    if proc.returncode != 0:
        raise HTTPException(status_code=500, detail=stderr.decode())

    return {"status": "ok", "message": "Database restored successfully"}
