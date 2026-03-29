"""Unit tests for _coerce_value and apply_old_data (integration)."""
import uuid
from datetime import datetime, timezone

import pytest

from routers._helpers import _coerce_value


# ── _coerce_value ──────────────────────────────────────────────────────────────

def test_coerce_uuid_string():
    raw = "123e4567-e89b-12d3-a456-426614174000"
    result = _coerce_value(raw)
    assert result == uuid.UUID(raw)
    assert isinstance(result, uuid.UUID)


def test_coerce_datetime_string_naive_becomes_utc():
    raw = "2026-03-29 05:23:09.450623"
    result = _coerce_value(raw)
    assert isinstance(result, datetime)
    assert result.tzinfo == timezone.utc
    assert result.year == 2026


def test_coerce_datetime_string_with_tz():
    raw = "2026-03-29T05:23:09+00:00"
    result = _coerce_value(raw)
    assert isinstance(result, datetime)
    assert result.tzinfo is not None


def test_coerce_list_of_uuid_strings():
    ids = [
        "123e4567-e89b-12d3-a456-426614174000",
        "00000000-0000-0000-0000-000000000001",
    ]
    result = _coerce_value(ids)
    assert all(isinstance(v, uuid.UUID) for v in result)


def test_coerce_plain_string_unchanged():
    result = _coerce_value("some description text")
    assert result == "some description text"


def test_coerce_int_unchanged():
    assert _coerce_value(42) == 42


def test_coerce_none_unchanged():
    assert _coerce_value(None) is None


def test_coerce_bool_unchanged():
    assert _coerce_value(True) is True


def test_coerce_empty_list():
    assert _coerce_value([]) == []


# ── apply_old_data (integration) ───────────────────────────────────────────────

@pytest.mark.asyncio
async def test_apply_old_data_skips_updated_at(conn):
    """updated_at must not be written by apply_old_data (it's auto-managed)."""
    brand_id = await conn.fetchval(
        "INSERT INTO brands (brand_name) VALUES ('TestBrand') RETURNING brand_id"
    )
    original_updated_at = await conn.fetchval(
        "SELECT updated_at FROM brands WHERE brand_id = $1", brand_id
    )

    from routers._helpers import apply_old_data

    old_data = {
        "brand_id": str(brand_id),
        "brand_name": "OldName",
        "created_at": "2020-01-01T00:00:00",
        "updated_at": "2020-01-01T00:00:00",  # must be skipped
        "deleted_at": None,
    }
    await apply_old_data(conn, "brands", "brand_id", brand_id, old_data)

    row = await conn.fetchrow(
        "SELECT brand_name, updated_at FROM brands WHERE brand_id = $1", brand_id
    )
    assert row["brand_name"] == "OldName"
    # updated_at should be unchanged (not overwritten with 2020-01-01)
    assert row["updated_at"] == original_updated_at


@pytest.mark.asyncio
async def test_apply_old_data_restores_name(conn):
    brand_id = await conn.fetchval(
        "INSERT INTO brands (brand_name) VALUES ('NewName') RETURNING brand_id"
    )

    from routers._helpers import apply_old_data

    old_data = {
        "brand_id": str(brand_id),
        "brand_name": "OldName",
        "created_at": "2020-01-01T00:00:00",
        "updated_at": "2020-01-01T00:00:00",
        "deleted_at": None,
    }
    await apply_old_data(conn, "brands", "brand_id", brand_id, old_data)

    name = await conn.fetchval("SELECT brand_name FROM brands WHERE brand_id = $1", brand_id)
    assert name == "OldName"
