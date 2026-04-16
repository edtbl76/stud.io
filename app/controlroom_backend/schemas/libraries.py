from pydantic import BaseModel
from uuid import UUID
from datetime import datetime
from typing import Optional
from schemas.common import TypeRef, ModelRef, ParentRef, ParentRefInput


class LibraryCreate(BaseModel):
    library_name: str
    brand_id: Optional[UUID] = None
    model_ids: Optional[list[UUID]] = None
    description: Optional[str] = None
    instrument_notes: Optional[str] = None
    recording_notes: Optional[str] = None
    workflow_notes: Optional[str] = None
    tag_ids: Optional[list[UUID]] = None
    attributes: Optional[dict] = None
    parent_ids: Optional[list[ParentRefInput]] = None


class LibraryUpdate(BaseModel):
    library_name: Optional[str] = None
    brand_id: Optional[UUID] = None
    model_ids: Optional[list[UUID]] = None
    description: Optional[str] = None
    instrument_notes: Optional[str] = None
    recording_notes: Optional[str] = None
    workflow_notes: Optional[str] = None
    tag_ids: Optional[list[UUID]] = None
    attributes: Optional[dict] = None
    parent_ids: Optional[list[ParentRefInput]] = None


class LibraryOut(BaseModel):
    library_id: UUID
    library_name: str
    brand_id: Optional[UUID] = None
    brand_name: Optional[str] = None
    full_library_name: str
    model_ids: Optional[list[UUID]] = None
    models: list[ModelRef] = []
    tag_ids: Optional[list[UUID]] = None
    tags: list[TypeRef] = []
    parents: list[ParentRef] = []
    description: Optional[str] = None
    instrument_notes: Optional[str] = None
    recording_notes: Optional[str] = None
    workflow_notes: Optional[str] = None
    attributes: Optional[dict] = None
    created_at: datetime
    updated_at: datetime
