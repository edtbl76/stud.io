from pydantic import BaseModel
from uuid import UUID
from datetime import datetime
from typing import Optional
from schemas.common import TypeRef


class WorkstationCreate(BaseModel):
    tool_name: str
    brand_id: Optional[UUID] = None
    version: Optional[str] = None
    tool_type_ids: Optional[list[UUID]] = None
    plugin_format_ids: Optional[list[UUID]] = None
    description: Optional[str] = None
    workflow_notes: Optional[str] = None
    tag_ids: Optional[list[UUID]] = None


class WorkstationUpdate(BaseModel):
    tool_name: Optional[str] = None
    brand_id: Optional[UUID] = None
    version: Optional[str] = None
    tool_type_ids: Optional[list[UUID]] = None
    plugin_format_ids: Optional[list[UUID]] = None
    description: Optional[str] = None
    workflow_notes: Optional[str] = None
    tag_ids: Optional[list[UUID]] = None


class WorkstationOut(BaseModel):
    workstation_id: UUID
    tool_name: str
    brand_id: Optional[UUID] = None
    brand_name: Optional[str] = None
    full_tool_name: str
    version: Optional[str] = None
    tool_type_ids: Optional[list[UUID]] = None
    tool_types: list[TypeRef] = []
    plugin_format_ids: Optional[list[UUID]] = None
    plugin_formats: list[TypeRef] = []
    tag_ids: Optional[list[UUID]] = None
    tags: list[TypeRef] = []
    description: Optional[str] = None
    workflow_notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime
