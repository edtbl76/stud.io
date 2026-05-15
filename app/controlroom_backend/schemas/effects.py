from pydantic import BaseModel
from uuid import UUID
from datetime import datetime
from typing import Optional
from schemas.common import TypeRef, ModelRef, ParentRef, ParentRefInput, PluginPathEntry


class EffectCreate(BaseModel):
    effect_name: str
    brand_id: Optional[UUID] = None
    model_ids: Optional[list[UUID]] = None
    version: Optional[str] = None
    collection: Optional[str] = None
    effect_type_ids: Optional[list[UUID]] = None
    tool_type_ids: Optional[list[UUID]] = None
    plugin_format_ids: Optional[list[UUID]] = None
    description: Optional[str] = None
    workflow_notes: Optional[str] = None
    recording_notes: Optional[str] = None
    artist_reference: Optional[str] = None
    attributes: Optional[dict] = None
    tag_ids: Optional[list[UUID]] = None
    parent_ids: Optional[list[ParentRefInput]] = None
    disk_paths: list[PluginPathEntry] = []


class EffectUpdate(BaseModel):
    effect_name: Optional[str] = None
    brand_id: Optional[UUID] = None
    model_ids: Optional[list[UUID]] = None
    version: Optional[str] = None
    collection: Optional[str] = None
    effect_type_ids: Optional[list[UUID]] = None
    tool_type_ids: Optional[list[UUID]] = None
    plugin_format_ids: Optional[list[UUID]] = None
    description: Optional[str] = None
    workflow_notes: Optional[str] = None
    recording_notes: Optional[str] = None
    artist_reference: Optional[str] = None
    attributes: Optional[dict] = None
    tag_ids: Optional[list[UUID]] = None
    parent_ids: Optional[list[ParentRefInput]] = None
    disk_paths: Optional[list[PluginPathEntry]] = None


class EffectOut(BaseModel):
    effect_id: UUID
    effect_name: str
    brand_id: Optional[UUID] = None
    brand_name: Optional[str] = None
    full_effect_name: str
    version: Optional[str] = None
    collection: Optional[str] = None
    model_ids: Optional[list[UUID]] = None
    models: list[ModelRef] = []
    effect_type_ids: Optional[list[UUID]] = None
    effect_types: list[TypeRef] = []
    tool_type_ids: Optional[list[UUID]] = None
    tool_types: list[TypeRef] = []
    plugin_format_ids: Optional[list[UUID]] = None
    plugin_formats: list[TypeRef] = []
    tag_ids: Optional[list[UUID]] = None
    tags: list[TypeRef] = []
    parents: list[ParentRef] = []
    description: Optional[str] = None
    workflow_notes: Optional[str] = None
    recording_notes: Optional[str] = None
    artist_reference: Optional[str] = None
    attributes: Optional[dict] = None
    disk_paths: list[PluginPathEntry] = []
    created_at: datetime
    updated_at: datetime
