"""Pydantic schemas for the Workbench API (U-02)."""
from __future__ import annotations

from uuid import UUID
from datetime import datetime

from pydantic import BaseModel


# ---------------------------------------------------------------------------
# Workbench query
# ---------------------------------------------------------------------------

class WorkbenchFilters(BaseModel):
    scan_id: UUID | None = None
    bucket: str | None = None
    catalog_type: str | None = None
    format: str | None = None
    show_confirmed: bool = False


class CollisionCopy(BaseModel):
    """One physical install participating in a collision (U-09)."""
    result_id: UUID
    path: str
    version: str | None = None
    format: str


class CollisionRecord(BaseModel):
    """The single catalog record a collision set's copies all resolve to (U-09)."""
    id: UUID
    table: str
    name: str | None = None
    vendor: str | None = None
    version: str | None = None


class CollisionInfo(BaseModel):
    """Per-row collision sub-state: the shared record + every duplicate copy (U-09)."""
    shared_catalog_record: CollisionRecord | None = None
    copies: list[CollisionCopy] = []


class WorkbenchRow(BaseModel):
    result_id: UUID
    disk_name: str
    disk_vendor: str
    disk_version: str
    disk_format: str
    disk_path: str
    display_name: str
    display_vendor: str
    catalog_record_id: UUID | None = None
    catalog_record_table: str | None = None
    catalog_record_name: str | None = None
    catalog_record_vendor: str | None = None
    catalog_record_version: str | None = None
    bucket: str
    collision: CollisionInfo | None = None
    confidence: str | None = None
    confirmed_at: datetime | None = None
    confirmed_by: str | None = None


class OrphanedRecord(BaseModel):
    catalog_record_id: UUID
    catalog_record_table: str
    name: str
    vendor: str | None = None
    version: str | None = None
    disk_paths: list[dict] = []


class WorkbenchResponse(BaseModel):
    rows: list[WorkbenchRow]
    orphaned: list[OrphanedRecord]
    scan_id: UUID | None = None


# ---------------------------------------------------------------------------
# Rule match counts (returned on rule creation)
# ---------------------------------------------------------------------------

class RuleMatchCounts(BaseModel):
    affected_count: int
    clean_count: int
    needs_review_count: int


# ---------------------------------------------------------------------------
# Find Link / Links
# ---------------------------------------------------------------------------

class FindLinkCandidatesResponse(BaseModel):
    type: str  # "unlinked" | "orphaned"
    candidates: list[WorkbenchRow | OrphanedRecord]
    total: int


class CreateLinkRequest(BaseModel):
    result_id: UUID
    catalog_record_id: UUID
    catalog_record_table: str


class BulkCreateLinkRequest(BaseModel):
    result_ids: list[UUID]
    catalog_record_id: UUID
    catalog_record_table: str


class BulkLinkResult(BaseModel):
    links_created: int


# ---------------------------------------------------------------------------
# Bulk update
# ---------------------------------------------------------------------------

class BulkUpdateRequest(BaseModel):
    result_ids: list[UUID]


class BulkUpdateResult(BaseModel):
    updated: int


# ---------------------------------------------------------------------------
# Reset
# ---------------------------------------------------------------------------

class ResetRequest(BaseModel):
    confirmation_text: str | None = None


class ResetResult(BaseModel):
    type: str  # "soft" | "hard"
    rules_disabled: int | None = None
    records_wiped: int | None = None
    seeded_rules_restored: int | None = None
