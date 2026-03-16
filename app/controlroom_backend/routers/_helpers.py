"""Shared router utilities."""


# SQL expression that converts a JSON parameter ($N) to parent_ref[].
# Usage: embed in INSERT/UPDATE SQL, pass json.dumps([{table_name, id}, ...]) as the param.
PARENT_REF_EXPR = """COALESCE(
    (SELECT ARRAY_AGG(ROW(x.table_name, x.id::UUID)::parent_ref)
     FROM jsonb_to_recordset({placeholder}::jsonb) AS x(table_name TEXT, id UUID)),
    ARRAY[]::parent_ref[]
)"""


def parent_ref_sql(placeholder: str) -> str:
    """Return the SQL expression for encoding parent_ref[], e.g. parent_ref_sql('$5')."""
    return PARENT_REF_EXPR.format(placeholder=placeholder)


def encode_parent_refs(parents) -> list:
    """Return a Python list for asyncpg to encode as jsonb via the registered codec."""
    if not parents:
        return []
    return [{"table_name": p.table_name, "id": str(p.id)} for p in parents]
