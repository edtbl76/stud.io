from pydantic import BaseModel
from uuid import UUID
from datetime import datetime
from typing import Optional
from schemas.common import TypeRef


class ModelCreate(BaseModel):
    model_name: str
    brand_id: Optional[UUID] = None
    model_type_ids: Optional[list[UUID]] = None
    creator: Optional[str] = None
    years_active: Optional[str] = None
    links: Optional[str] = None
    description: Optional[str] = None
    recording_notes: Optional[str] = None
    artist_reference: Optional[str] = None
    attributes: Optional[dict] = None


class ModelUpdate(BaseModel):
    model_name: Optional[str] = None
    brand_id: Optional[UUID] = None
    model_type_ids: Optional[list[UUID]] = None
    creator: Optional[str] = None
    years_active: Optional[str] = None
    links: Optional[str] = None
    description: Optional[str] = None
    recording_notes: Optional[str] = None
    artist_reference: Optional[str] = None
    attributes: Optional[dict] = None


class ModelOut(BaseModel):
    model_id: UUID
    model_name: str
    brand_id: Optional[UUID] = None
    brand_name: Optional[str] = None
    full_model_name: str
    model_type_ids: Optional[list[UUID]] = None
    model_types: list[TypeRef] = []
    creator: Optional[str] = None
    years_active: Optional[str] = None
    links: Optional[str] = None
    description: Optional[str] = None
    recording_notes: Optional[str] = None
    artist_reference: Optional[str] = None
    attributes: Optional[dict] = None
    created_at: datetime
    updated_at: datetime
