"""Pydantic schemas for scanner rule management (U-02)."""
from __future__ import annotations

from uuid import UUID
from datetime import datetime

from pydantic import BaseModel



# ---------------------------------------------------------------------------
# Vendor rules
# ---------------------------------------------------------------------------

class VendorRuleIn(BaseModel):
    disk_vendor: str
    catalog_vendor: str


class VendorRuleUpdate(BaseModel):
    catalog_vendor: str


class VendorRuleOut(BaseModel):
    rule_id: UUID
    disk_vendor: str
    catalog_vendor: str
    enabled: bool
    created_by: str
    created_at: datetime
    affected_count: int
    clean_count: int
    needs_review_count: int


# ---------------------------------------------------------------------------
# Name rules
# ---------------------------------------------------------------------------

class NameRuleIn(BaseModel):
    disk_name: str
    catalog_name: str


class NameRuleUpdate(BaseModel):
    catalog_name: str


class NameRuleOut(BaseModel):
    rule_id: UUID
    disk_name: str
    catalog_name: str
    enabled: bool
    created_by: str
    created_at: datetime
    affected_count: int
    clean_count: int
    needs_review_count: int


# ---------------------------------------------------------------------------
# Pattern rules
# ---------------------------------------------------------------------------

class PatternRuleIn(BaseModel):
    label: str
    pattern: str
    match_fields: list[str]
    action: str = "alias_to_match"


class PatternRuleOut(BaseModel):
    rule_id: UUID
    label: str
    pattern: str
    match_fields: list[str]
    action: str
    enabled: bool
    is_seeded: bool
    created_by: str
    created_at: datetime
    affected_count: int
    clean_count: int
    needs_review_count: int


# ---------------------------------------------------------------------------
# Collections
# ---------------------------------------------------------------------------

class AllRules(BaseModel):
    vendor: list[VendorRuleOut]
    name: list[NameRuleOut]
    pattern: list[PatternRuleOut]


# ---------------------------------------------------------------------------
# Toggle / acknowledge
# ---------------------------------------------------------------------------

class RuleToggleRequest(BaseModel):
    enabled: bool


class AcknowledgeCleanResult(BaseModel):
    acknowledged: int
