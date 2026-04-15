from pydantic import BaseModel
from uuid import UUID
from datetime import datetime
from typing import Optional
from schemas.common import TypeRef, ModelRef, ParentRef, ParentRefInput


class InstrumentCreate(BaseModel):
    instrument_name: str
    brand_id: Optional[UUID] = None
    model_ids: Optional[list[UUID]] = None
    version: Optional[str] = None
    instrument_type_ids: Optional[list[UUID]] = None
    tool_type_ids: Optional[list[UUID]] = None
    plugin_format_ids: Optional[list[UUID]] = None
    description: Optional[str] = None
    instrument_notes: Optional[str] = None
    recording_notes: Optional[str] = None
    artist_reference: Optional[str] = None
    attributes: Optional[dict] = None
    tag_ids: Optional[list[UUID]] = None
    parent_ids: Optional[list[ParentRefInput]] = None


class InstrumentUpdate(BaseModel):
    instrument_name: Optional[str] = None
    brand_id: Optional[UUID] = None
    model_ids: Optional[list[UUID]] = None
    version: Optional[str] = None
    instrument_type_ids: Optional[list[UUID]] = None
    tool_type_ids: Optional[list[UUID]] = None
    plugin_format_ids: Optional[list[UUID]] = None
    description: Optional[str] = None
    instrument_notes: Optional[str] = None
    recording_notes: Optional[str] = None
    artist_reference: Optional[str] = None
    attributes: Optional[dict] = None
    tag_ids: Optional[list[UUID]] = None
    parent_ids: Optional[list[ParentRefInput]] = None


class InstrumentOut(BaseModel):
    instrument_id: UUID
    instrument_name: str
    brand_id: Optional[UUID] = None
    brand_name: Optional[str] = None
    full_instrument_name: str
    version: Optional[str] = None
    model_ids: Optional[list[UUID]] = None
    models: list[ModelRef] = []
    instrument_type_ids: Optional[list[UUID]] = None
    instrument_types: list[TypeRef] = []
    tool_type_ids: Optional[list[UUID]] = None
    tool_types: list[TypeRef] = []
    plugin_format_ids: Optional[list[UUID]] = None
    plugin_formats: list[TypeRef] = []
    tag_ids: Optional[list[UUID]] = None
    tags: list[TypeRef] = []
    parents: list[ParentRef] = []
    description: Optional[str] = None
    instrument_notes: Optional[str] = None
    recording_notes: Optional[str] = None
    artist_reference: Optional[str] = None
    attributes: Optional[dict] = None
    created_at: datetime
    updated_at: datetime
