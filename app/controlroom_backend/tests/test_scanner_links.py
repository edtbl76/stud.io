"""Integration tests for scanner link management endpoints."""
from __future__ import annotations

from uuid import uuid4

import pytest

from ._scanner_helpers import insert_scan


async def _insert_effect_with_paths(conn, name="Reverb Pro") -> uuid4:
    effect_id = await conn.fetchval(
        "INSERT INTO effects (effect_name) VALUES ($1) RETURNING effect_id", name
    )
    await conn.execute(
        "UPDATE effects SET disk_paths=$1 WHERE effect_id=$2",
        [{"path": "/missing/reverb.vst3", "format": "vst3", "version": "1.0.0"}],
        effect_id,
    )
    return effect_id


async def _insert_effect(conn, name="Reverb Pro") -> uuid4:
    return await conn.fetchval(
        "INSERT INTO effects (effect_name) VALUES ($1) RETURNING effect_id", name
    )


async def _insert_branded_effect(conn, name="Reverb Pro", brand="Catalog Brand") -> uuid4:
    brand_id = await conn.fetchval(
        "INSERT INTO brands (brand_name) VALUES ($1) RETURNING brand_id", brand
    )
    return await conn.fetchval(
        "INSERT INTO effects (effect_name, brand_id) VALUES ($1,$2) RETURNING effect_id", name, brand_id
    )


async def _distinct_result(conn, scan_id, vendor="Other Vendor", name="Delay Machine") -> uuid4:
    return await conn.fetchval(
        "INSERT INTO plugin_scan_results (scan_id, name, vendor, version, format, path, status) "
        "VALUES ($1,$2,$3,'1.0.0','vst3','/p/delay.vst3','untracked') RETURNING result_id",
        scan_id, name, vendor,
    )


async def _setup_candidates(conn) -> tuple:
    """Shared setup: orphaned catalog record + unlinked scan result."""
    effect_id = await _insert_effect_with_paths(conn)
    _, result_id = await insert_scan(conn, status="untracked")
    return effect_id, result_id


async def _setup_link(conn) -> tuple:
    """Shared setup: unlinked result + plain catalog record."""
    _, result_id = await insert_scan(conn, status="untracked")
    effect_id = await _insert_effect(conn)
    return result_id, effect_id


# ---------------------------------------------------------------------------
# GET /scanner/links/candidates?type=unlinked
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_candidates_unlinked_returns_orphaned_records(client, conn, admin_headers):
    effect_id, result_id = await _setup_candidates(conn)
    resp = await client.get(
        f"/scanner/links/candidates?type=unlinked&source_id={result_id}", headers=admin_headers
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["type"] == "unlinked"
    assert any(str(c["catalog_record_id"]) == str(effect_id) for c in data["candidates"])


@pytest.mark.asyncio
async def test_candidates_unlinked_q_filter(client, conn, admin_headers):
    await _insert_effect_with_paths(conn, name="Reverb Pro")
    await _insert_effect_with_paths(conn, name="Delay Machine")
    _, result_id = await insert_scan(conn, status="untracked")
    resp = await client.get(
        f"/scanner/links/candidates?type=unlinked&source_id={result_id}&q=reverb", headers=admin_headers
    )
    assert all("reverb" in c["name"].lower() for c in resp.json()["candidates"])


# ---------------------------------------------------------------------------
# GET /scanner/links/candidates?type=orphaned
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_candidates_orphaned_returns_unlinked_results(client, conn, admin_headers):
    effect_id, result_id = await _setup_candidates(conn)
    resp = await client.get(
        f"/scanner/links/candidates?type=orphaned&source_id={effect_id}", headers=admin_headers
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["type"] == "orphaned"
    assert any(str(c["result_id"]) == str(result_id) for c in data["candidates"])


# ---------------------------------------------------------------------------
# POST /scanner/links (single)
# ---------------------------------------------------------------------------

async def _binding_row(conn, fingerprint: str):
    return await conn.fetchrow(
        "SELECT scanned_vendor, scanned_name, record_id, record_table, confirmed_by, confirmed_at "
        "FROM scanner_plugin_links WHERE fingerprint = $1",
        fingerprint,
    )


async def _assert_no_rules(conn, disk_name: str, disk_vendor: str) -> None:
    name_rule = await conn.fetchrow(
        "SELECT 1 FROM scanner_name_rules WHERE disk_name = $1", disk_name
    )
    vendor_rule = await conn.fetchrow(
        "SELECT 1 FROM scanner_vendor_rules WHERE disk_vendor = $1", disk_vendor
    )
    assert name_rule is None
    assert vendor_rule is None


@pytest.mark.asyncio
async def test_create_link_writes_binding_not_rules(client, conn, admin_headers):
    result_id, effect_id = await _setup_link(conn)
    resp = await client.post(
        "/scanner/links",
        json={"result_id": str(result_id), "catalog_record_id": str(effect_id), "catalog_record_table": "effects"},
        headers=admin_headers,
    )
    assert resp.status_code == 201
    assert resp.json()["links_created"] == 1
    binding = await _binding_row(conn, "acme audio reverb pro")
    assert binding is not None
    assert str(binding["record_id"]) == str(effect_id)
    assert binding["record_table"] == "effects"
    await _assert_no_rules(conn, "reverb pro", "acme audio")


async def _name_rule(conn, disk_name: str):
    return await conn.fetchrow(
        "SELECT catalog_name FROM scanner_name_rules WHERE disk_name = $1", disk_name
    )


async def _vendor_rule(conn, disk_vendor: str):
    return await conn.fetchrow(
        "SELECT catalog_vendor FROM scanner_vendor_rules WHERE disk_vendor = $1", disk_vendor
    )


async def _post_link(client, headers, result_id, effect_id, **extra):
    return await client.post(
        "/scanner/links",
        json={"result_id": str(result_id), "catalog_record_id": str(effect_id),
              "catalog_record_table": "effects", **extra},
        headers=headers,
    )


@pytest.mark.asyncio
async def test_create_link_binding_columns_match_confirm_shape(client, conn, admin_headers):
    result_id, effect_id = await _setup_link(conn)
    await _post_link(client, admin_headers, result_id, effect_id)
    binding = await _binding_row(conn, "acme audio reverb pro")
    assert binding["scanned_vendor"] == "Acme Audio"
    assert binding["scanned_name"] == "Reverb Pro"
    assert binding["confirmed_by"] == "adminuser"
    assert binding["confirmed_at"] is not None


@pytest.mark.asyncio
async def test_create_link_create_rules_writes_rules(client, conn, admin_headers):
    _, result_id = await insert_scan(conn, status="untracked")
    effect_id = await _insert_branded_effect(conn)
    resp = await _post_link(client, admin_headers, result_id, effect_id, create_rules=True)
    assert resp.status_code == 201
    assert await _binding_row(conn, "acme audio reverb pro") is not None
    name_rule = await _name_rule(conn, "reverb pro")
    vendor_rule = await _vendor_rule(conn, "acme audio")
    assert name_rule is not None and name_rule["catalog_name"] == "Reverb Pro"
    assert vendor_rule is not None and vendor_rule["catalog_vendor"] == "Catalog Brand"


@pytest.mark.asyncio
async def test_create_link_create_rules_null_vendor_writes_name_only(client, conn, admin_headers):
    result_id, effect_id = await _setup_link(conn)  # _insert_effect has no brand => null catalog vendor
    resp = await _post_link(client, admin_headers, result_id, effect_id, create_rules=True)
    assert resp.status_code == 201
    assert await _binding_row(conn, "acme audio reverb pro") is not None
    assert await _name_rule(conn, "reverb pro") is not None
    assert await _vendor_rule(conn, "acme audio") is None


@pytest.mark.asyncio
async def test_create_link_relink_updates_binding_in_place(client, conn, admin_headers):
    result_id, effect_a = await _setup_link(conn)
    effect_b = await _insert_effect(conn, name="Delay Machine")
    await _post_link(client, admin_headers, result_id, effect_a)
    await _post_link(client, admin_headers, result_id, effect_b)
    rows = await conn.fetch(
        "SELECT record_id FROM scanner_plugin_links WHERE fingerprint = $1", "acme audio reverb pro"
    )
    assert len(rows) == 1
    assert str(rows[0]["record_id"]) == str(effect_b)


@pytest.mark.asyncio
async def test_find_link_binding_loads_as_persistent(client, conn, admin_headers):
    from routers.scanner_match import load_persistent_links
    result_id, effect_id = await _setup_link(conn)
    await _post_link(client, admin_headers, result_id, effect_id)
    links = await load_persistent_links(conn)
    assert "acme audio reverb pro" in links
    record_id, record_table = links["acme audio reverb pro"]
    assert str(record_id) == str(effect_id)
    assert record_table == "effects"


@pytest.mark.asyncio
async def test_create_link_purges_matching_rejection(client, conn, admin_headers):
    result_id, effect_id = await _setup_link(conn)
    fp = "acme audio reverb pro"
    await conn.execute(
        "INSERT INTO scanner_rejections (fingerprint, record_id, record_table, confidence, rejected_by) VALUES ($1,$2,$3,$4,$5)",
        fp, effect_id, "effects", "exact", "admin",
    )
    await client.post(
        "/scanner/links",
        json={"result_id": str(result_id), "catalog_record_id": str(effect_id), "catalog_record_table": "effects"},
        headers=admin_headers,
    )
    rejection = await conn.fetchrow(
        "SELECT 1 FROM scanner_rejections WHERE fingerprint=$1 AND record_id=$2", fp, effect_id
    )
    assert rejection is None


# ---------------------------------------------------------------------------
# POST /scanner/links/bulk
# ---------------------------------------------------------------------------

async def _post_bulk(client, headers, result_ids, effect_id, **extra):
    return await client.post(
        "/scanner/links/bulk",
        json={"result_ids": [str(r) for r in result_ids], "catalog_record_id": str(effect_id),
              "catalog_record_table": "effects", **extra},
        headers=headers,
    )


@pytest.mark.asyncio
async def test_bulk_create_links_writes_one_binding_per_result(client, conn, admin_headers):
    scan_id, result_id_1 = await insert_scan(conn, status="untracked")
    result_id_2 = await _distinct_result(conn, scan_id)  # distinct vendor/name => distinct fingerprint
    effect_id = await _insert_effect(conn)
    resp = await _post_bulk(client, admin_headers, [result_id_1, result_id_2], effect_id)
    assert resp.status_code == 201
    assert resp.json()["links_created"] == 2
    assert await _binding_row(conn, "acme audio reverb pro") is not None
    assert await _binding_row(conn, "other vendor delay machine") is not None
    assert await _name_rule(conn, "reverb pro") is None
    assert await _vendor_rule(conn, "acme audio") is None


@pytest.mark.asyncio
async def test_bulk_create_links_create_rules_writes_rules(client, conn, admin_headers):
    scan_id, result_id_1 = await insert_scan(conn, status="untracked")
    result_id_2 = await _distinct_result(conn, scan_id)
    effect_id = await _insert_branded_effect(conn)
    resp = await _post_bulk(client, admin_headers, [result_id_1, result_id_2], effect_id, create_rules=True)
    assert resp.status_code == 201
    assert await _binding_row(conn, "acme audio reverb pro") is not None
    assert await _binding_row(conn, "other vendor delay machine") is not None
    assert await _name_rule(conn, "reverb pro") is not None
    assert await _vendor_rule(conn, "acme audio") is not None


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_candidates_requires_auth(client):
    assert (await client.get(f"/scanner/links/candidates?type=unlinked&source_id={uuid4()}")).status_code == 401


@pytest.mark.asyncio
async def test_create_link_requires_admin(client, auth_headers):
    resp = await client.post(
        "/scanner/links",
        json={"result_id": str(uuid4()), "catalog_record_id": str(uuid4()), "catalog_record_table": "effects"},
        headers=auth_headers,
    )
    assert resp.status_code == 403
