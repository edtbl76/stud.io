from typing import TypeVar
from pydantic import BaseModel
from uuid import UUID

ItemT = TypeVar('ItemT')


class PagedResponse[ItemT](BaseModel):
    items: list[ItemT]
    total: int

class NamedRef(BaseModel):
    """Resolved lookup-table reference: {id, name}."""
    id: UUID
    name: str

class ParentRefBase(BaseModel):
    """Resolved parent reference: {table_name, id}."""
    table_name: str
    id: UUID

class TypeRef(NamedRef):
    """Resolved lookup-table reference: {id, name}. Used for all type/tag arrays."""

class ModelRef(NamedRef):
    """Resolved model reference: {id, name}."""

class ParentRef(ParentRefBase):
    """Resolved parent reference: {table_name, id, name}."""
    name: str | None = None

class ParentRefInput(ParentRefBase):
    """Input shape for writing parent_ids — name not required."""

