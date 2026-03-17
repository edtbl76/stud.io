from pydantic import BaseModel
from uuid import UUID
from datetime import datetime
from typing import Optional


class BrandCreate(BaseModel):
    legal_name: Optional[str] = None
    brand_name: Optional[str] = None
    entity_type_id: Optional[UUID] = None
    website: Optional[str] = None
    description: Optional[str] = None
    founder: Optional[str] = None
    years: Optional[str] = None


class BrandUpdate(BaseModel):
    legal_name: Optional[str] = None
    brand_name: Optional[str] = None
    entity_type_id: Optional[UUID] = None
    website: Optional[str] = None
    description: Optional[str] = None
    founder: Optional[str] = None
    years: Optional[str] = None


class BrandOut(BaseModel):
    brand_id: UUID
    legal_name: Optional[str] = None
    brand_name: Optional[str] = None
    entity_type_id: Optional[UUID] = None
    entity_type_name: Optional[str] = None
    website: Optional[str] = None
    description: Optional[str] = None
    founder: Optional[str] = None
    years: Optional[str] = None
    created_at: datetime
    updated_at: datetime
