"""Import/Export endpoints — xlsx download and upload."""
from datetime import datetime
from typing import Annotated, TypedDict

from asyncpg import Connection
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import StreamingResponse

from database import get_conn
from routers.auth import require_admin, UserOut
from routers._xlsx_schema import TABLE_CONFIGS, VALID_KEYS
from routers._xlsx_build import fetch_lookup_data, fetch_table_rows, build_workbook
from routers._xlsx_import import parse_workbook, validate_import, execute_import

router = APIRouter()

_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
_MAX_UPLOAD_MB = 10


class _SheetSummary(TypedDict):
    sheet: str
    creates: int
    updates: int


class ImportResult(TypedDict):
    summary: list[_SheetSummary]
    total_creates: int
    total_updates: int


def _xlsx_response(content: bytes, filename: str) -> StreamingResponse:
    return StreamingResponse(
        iter([content]),
        media_type=_MEDIA_TYPE,
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


def _parse_table_keys(tables: str) -> list[str]:
    keys = [k.strip() for k in tables.split(",") if k.strip()]
    invalid = [k for k in keys if k not in VALID_KEYS]
    if invalid:
        raise HTTPException(status_code=400, detail=f"Unknown tables: {', '.join(invalid)}")
    if not keys:
        raise HTTPException(status_code=400, detail="No tables specified")
    return keys


@router.get("/export/xlsx", responses={400: {"description": "Invalid table keys"}})
async def export_xlsx(
    tables: Annotated[str, Query(description="Comma-separated table keys")],
    _: Annotated[UserOut, Depends(require_admin)],
    conn: Annotated[Connection, Depends(get_conn)],
) -> StreamingResponse:
    keys = _parse_table_keys(tables)
    lookup_data = await fetch_lookup_data(conn)
    rows_by_key = {k: await fetch_table_rows(conn, TABLE_CONFIGS[k]) for k in keys}
    content = build_workbook(keys, rows_by_key, lookup_data, is_template=False)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    return _xlsx_response(content, f"controlroom_export_{ts}.xlsx")


@router.get("/export/template", responses={400: {"description": "Invalid table keys"}})
async def export_template(
    tables: Annotated[str, Query(description="Comma-separated table keys")],
    _: Annotated[UserOut, Depends(require_admin)],
    conn: Annotated[Connection, Depends(get_conn)],
) -> StreamingResponse:
    keys = _parse_table_keys(tables)
    lookup_data = await fetch_lookup_data(conn)
    content = build_workbook(keys, {}, lookup_data, is_template=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    return _xlsx_response(content, f"controlroom_template_{ts}.xlsx")


@router.post(
    "/import/xlsx",
    responses={
        400: {"description": "Invalid file or unreadable content"},
        413: {"description": "File too large"},
        422: {"description": "Validation errors in spreadsheet data"},
    },
)
async def import_xlsx(
    file: Annotated[UploadFile, File(...)],
    user: Annotated[UserOut, Depends(require_admin)],
    conn: Annotated[Connection, Depends(get_conn)],
) -> ImportResult:
    if not file.filename or not file.filename.endswith(".xlsx"):
        raise HTTPException(status_code=400, detail="File must be a .xlsx file")
    raw = await file.read()
    if len(raw) > _MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"File exceeds {_MAX_UPLOAD_MB} MB limit")
    try:
        parsed = parse_workbook(raw)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not read xlsx: {exc}") from exc
    if not parsed:
        raise HTTPException(status_code=400, detail="No recognisable sheets found")
    lookup_data = await fetch_lookup_data(conn)
    errors = validate_import(parsed, lookup_data)
    if errors:
        raise HTTPException(status_code=422, detail={"errors": errors})
    summary = await execute_import(conn, parsed, lookup_data, user.username)
    total_creates = sum(s["creates"] for s in summary)
    total_updates = sum(s["updates"] for s in summary)
    return {"summary": summary, "total_creates": total_creates, "total_updates": total_updates}
