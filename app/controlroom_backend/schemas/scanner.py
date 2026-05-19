"""Pydantic schemas for the Plugin Scanner API."""
from __future__ import annotations

from collections.abc import Mapping
from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, field_validator


def build_match_meta(
    r: Mapping[str, Any],
    m: dict[str, Any] | None,
    catalog_disk_paths: list[dict[str, Any]] | None = None,
) -> "MatchMeta":
    return MatchMeta(
        confidence=r["confidence"] or "none",
        score=float(r["score"]) if r["score"] is not None else None,
        record_id=r["record_id"], record_table=r["record_table"],
        record_name=m["name"] if m else None,
        record_vendor=m["vendor"] if m else None,
        record_version=m["version"] if m else None,
        catalog_disk_paths=catalog_disk_paths or [],
    )


def build_scan_result(
    r: Mapping[str, Any],
    meta: dict[str, dict[str, Any]],
    status: str | None = None,
) -> "ScanResult":
    rid = str(r["record_id"]) if r["record_id"] else None
    m = meta.get(rid) if rid else None
    disk_paths = m.get("disk_paths") if m else None
    return ScanResult(
        result_id=r["result_id"], status=status if status is not None else r["status"],
        name=r["name"], vendor=r["vendor"], version=r["version"],
        format=r["format"], path=r["path"],
        match=build_match_meta(r, m, catalog_disk_paths=disk_paths) if r["record_id"] else None,
        dismissed_at=r.get("dismissed_at"),
        confirmed_at=r.get("confirmed_at"),
    )


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
    matched: int
    conflicted: int
    unconfirmed: int
    untracked: int
    orphaned: int
    ignored: int = 0


# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------

class PluginPathEntry(BaseModel):
    path: str
    format: str
    version: str


class MatchMeta(BaseModel):
    confidence: str
    score: float | None = None
    record_id: UUID | None = None
    record_table: str | None = None
    record_name: str | None = None
    record_vendor: str | None = None
    record_version: str | None = None
    catalog_disk_paths: list[PluginPathEntry] = []


class CatalogSearchResult(BaseModel):
    record_id: str
    record_table: str
    name: str
    vendor: str | None = None
    version: str | None = None


class ScanResult(BaseModel):
    result_id: UUID
    status: str
    name: str
    vendor: str
    version: str
    format: str
    path: str
    match: MatchMeta | None = None
    dismissed_at: datetime | None = None
    confirmed_at: datetime | None = None


class AbsentRecord(BaseModel):
    record_id: str
    record_table: str
    name: str
    vendor: str | None = None
    version: str | None = None
    disk_paths: list[PluginPathEntry]


class ScanReport(BaseModel):
    scan_id: UUID
    scanned_at: datetime
    known: list[ScanResult]
    matched: list[ScanResult]
    conflicted: list[ScanResult]
    unconfirmed: list[ScanResult]
    untracked: list[ScanResult]
    orphaned: list[ScanResult]
    ignored: list[ScanResult] = []
    absent: list[AbsentRecord] = []


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


# ---------------------------------------------------------------------------
# Admin
# ---------------------------------------------------------------------------

class CreateExclusionRequest(BaseModel):
    vendor: str
    name: str


class ExclusionOut(BaseModel):
    exclusion_id: UUID
    vendor: str
    name: str
    excluded_at: datetime


class PurgeResult(BaseModel):
    deleted_count: int


class StatusCounts(BaseModel):
    known: int = 0
    matched: int = 0
    conflicted: int = 0
    unconfirmed: int = 0
    untracked: int = 0
    orphaned: int = 0
    ignored: int = 0


class ConfirmationCounts(BaseModel):
    confirmed: int = 0
    rejected: int = 0
    ignored: int = 0


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
