"""Pydantic schemas for the Plugin Scanner API."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


# ---------------------------------------------------------------------------
# Ingest
# ---------------------------------------------------------------------------

_ALLOWED_FORMATS = {"vst3", "au", "vst2"}


class ScannedPlugin(BaseModel):
    name: str
    vendor: str
    version: str
    format: str
    path: str
    metadata_source: str | None = None

    @field_validator("format", mode="before")
    @classmethod
    def normalize_format(cls, v: object) -> str:
        normalized = str(v).lower()
        if normalized not in _ALLOWED_FORMATS:
            raise ValueError(f"format must be one of {sorted(_ALLOWED_FORMATS)}, got {v!r}")
        return normalized


class ScanPayload(BaseModel):
    plugins: list[ScannedPlugin]
    source_machine: str


class ScanSummary(BaseModel):
    scan_id: UUID
    known: int
    unlinked: int
    orphaned: int
    needs_review: int
    excluded: int


class CatalogSearchResult(BaseModel):
    record_id: str
    record_table: str
    name: str
    vendor: str | None = None
    version: str | None = None


# ---------------------------------------------------------------------------
# Confirm
# ---------------------------------------------------------------------------

class Confirmation(BaseModel):
    result_id: UUID
    action: str
    target_table: str | None = None
    target_id: str | None = None


class ConfirmPayload(BaseModel):
    confirmations: list[Confirmation]


class ConfirmResult(BaseModel):
    applied: int
    errors: list[dict[str, Any]]


class CollisionResolveRequest(BaseModel):
    """Resolve a whole collision atomically. keeper_id is required for
    remove_straggler and must be one of copy_ids."""
    action: Literal["keep_all", "remove_straggler"]
    copy_ids: list[UUID] = Field(min_length=1)
    keeper_id: UUID | None = None


class CollisionResolveResult(BaseModel):
    acknowledged: int
    dismissed: int


# ---------------------------------------------------------------------------
# Admin
# ---------------------------------------------------------------------------

class CreateExclusionRequest(BaseModel):
    vendor: str
    name: str
    format: str | None = None


class ExclusionOut(BaseModel):
    exclusion_id: UUID
    vendor: str
    name: str
    excluded_at: datetime
    excluded_by: str | None = None
    format: str | None = None


class PurgeResult(BaseModel):
    deleted_count: int


class StatusCounts(BaseModel):
    known: int = 0
    needs_review: int = 0
    unlinked: int = 0
    orphaned: int = 0
    excluded: int = 0


class ConfirmationCounts(BaseModel):
    confirmed: int = 0
    rejected: int = 0
    excluded: int = 0


class ScanRun(BaseModel):
    scan_id: UUID
    scanned_at: datetime
    source_machine: str
    total_count: int
    status: str = "completed"
    status_counts: StatusCounts
    confirmation_counts: ConfirmationCounts


class CreateKeyRequest(BaseModel):
    label: str


class APIKeyResponse(BaseModel):
    key_id: UUID
    label: str
    key_hint: str
    created_at: datetime
    revoked_at: datetime | None = None


class APIKeyCreated(APIKeyResponse):
    key: str
