from typing import TypeVar, Annotated
from fastapi import Query
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

class ListParams:
    """Request-time parameters for list endpoints.

    sort_by and sort_dir are parallel lists collected from repeated query params
    (?sort_by=a&sort_by=b&sort_dir=asc&sort_dir=desc).  A single value becomes
    a one-element list, keeping backwards compatibility.
    """

    def __init__(
        self,
        limit: int = 100,
        offset: int = 0,
        sort_by: Annotated[list[str], Query()] = (),   # type: ignore[assignment]
        sort_dir: Annotated[list[str], Query()] = (),  # type: ignore[assignment]
    ) -> None:
        self.limit = limit
        self.offset = offset
        self.sort_by: list[str] = list(sort_by)
        self.sort_dir: list[str] = list(sort_dir)