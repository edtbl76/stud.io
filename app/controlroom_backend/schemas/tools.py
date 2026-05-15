from pydantic import BaseModel
from uuid import UUID
from datetime import datetime
from typing import Optional
from schemas.common import TypeRef, ModelRef, PluginPathEntry


class ToolCreate(BaseModel):
    tool_name: str
    brand_id: Optional[UUID] = None
    model_ids: Optional[list[UUID]] = None   # measurement/reference only
    version: Optional[str] = None
    tool_type_ids: Optional[list[UUID]] = None
    plugin_format_ids: Optional[list[UUID]] = None
    description: Optional[str] = None
    workflow_notes: Optional[str] = None
    tag_ids: Optional[list[UUID]] = None
    disk_paths: list[PluginPathEntry] = []


class ToolUpdate(BaseModel):
    tool_name: Optional[str] = None
    brand_id: Optional[UUID] = None
    model_ids: Optional[list[UUID]] = None
    version: Optional[str] = None
    tool_type_ids: Optional[list[UUID]] = None
    plugin_format_ids: Optional[list[UUID]] = None
    description: Optional[str] = None
    workflow_notes: Optional[str] = None
    tag_ids: Optional[list[UUID]] = None
    disk_paths: Optional[list[PluginPathEntry]] = None


class ToolOut(BaseModel):
    """Base output for all tool tables. id_field varies per table."""
    tool_id: UUID          # normalized — router maps the real PK here
    tool_name: str
    brand_id: Optional[UUID] = None
    brand_name: Optional[str] = None
    full_tool_name: str
    version: Optional[str] = None
    model_ids: Optional[list[UUID]] = None
    models: list[ModelRef] = []
    tool_type_ids: Optional[list[UUID]] = None
    tool_types: list[TypeRef] = []
    plugin_format_ids: Optional[list[UUID]] = None
    plugin_formats: list[TypeRef] = []
    tag_ids: Optional[list[UUID]] = None
    tags: list[TypeRef] = []
    description: Optional[str] = None
    workflow_notes: Optional[str] = None
    disk_paths: list[PluginPathEntry] = []
    created_at: datetime
    updated_at: datetime
