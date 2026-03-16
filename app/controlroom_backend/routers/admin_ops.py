import os
import subprocess
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse

from config import settings
from routers.auth import get_current_user, UserOut

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


@router.get("/backup")
async def backup(_: UserOut = Depends(get_current_user)):
    """Dump controlroomdb to a SQL file and return it as a download."""
    result = subprocess.run(
        _pg_args("pg_dump") + ["--clean", "--if-exists"],
        capture_output=True,
        env=_pg_env(),
    )
    if result.returncode != 0:
        raise HTTPException(status_code=500, detail=result.stderr.decode())

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"controlroomdb_{timestamp}.sql"

    return StreamingResponse(
        iter([result.stdout]),
        media_type="application/octet-stream",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.post("/restore")
async def restore(file: UploadFile = File(...), _: UserOut = Depends(get_current_user)):
    """Restore controlroomdb from an uploaded SQL file."""
    if not file.filename or not file.filename.endswith(".sql"):
        raise HTTPException(status_code=400, detail="File must be a .sql file")

    sql_bytes = await file.read()

    result = subprocess.run(
        _pg_args("psql"),
        input=sql_bytes,
        capture_output=True,
        env=_pg_env(),
    )
    if result.returncode != 0:
        raise HTTPException(status_code=500, detail=result.stderr.decode())

    return {"status": "ok", "message": "Database restored successfully"}
