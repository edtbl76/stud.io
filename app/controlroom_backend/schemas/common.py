from pydantic import BaseModel
from uuid import UUID


class TypeRef(BaseModel):
    """Resolved lookup-table reference: {id, name}. Used for all type/tag arrays."""
    id: UUID
    name: str


class ModelRef(BaseModel):
    """Resolved model reference: {id, name}."""
    id: UUID
    name: str


class ParentRef(BaseModel):
    """Resolved parent reference: {table_name, id, name}."""
    table_name: str
    id: UUID
    name: str | None = None


class ParentRefInput(BaseModel):
    """Input shape for writing parent_ids — name not required."""
    table_name: str
    id: UUID
