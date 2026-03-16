from pydantic import BaseModel
from uuid import UUID
from typing import Optional


class LookupCreate(BaseModel):
    type_name: str
    type_description: Optional[str] = None


class LookupUpdate(BaseModel):
    type_name: Optional[str] = None
    type_description: Optional[str] = None


class LookupOut(BaseModel):
    type_id: UUID
    type_name: str
    type_description: Optional[str] = None
