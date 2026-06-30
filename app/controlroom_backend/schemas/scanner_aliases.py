"""Pydantic schemas for direct name-alias writes (U-19 Set Name Alias)."""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class CreateAliasRequest(BaseModel):
    """A request to alias a raw scanned disk name to a catalog record."""

    disk_name: str
    catalog_record_id: UUID
    catalog_table: str


class AliasOut(BaseModel):
    """A persisted name alias (one ``scanner_name_aliases`` row)."""

    alias_id: UUID
    disk_name: str
    catalog_record_id: UUID
    catalog_table: str
    created_by: str
    created_at: datetime
