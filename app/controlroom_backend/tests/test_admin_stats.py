# tests/test_admin_stats.py


def _find_stat(data: dict, table_name: str) -> dict:
    """Return the stat entry for a table by display name, or fail clearly if absent."""
    stat = next(
        (t for g in data["groups"] for t in g["tables"] if t["name"] == table_name),
        None,
    )
    assert stat is not None, f"table {table_name!r} not found in stats response"
    return stat


async def test_stats_requires_auth(client):
    response = await client.get("/studio/admin/stats")
    assert response.status_code == 401


async def test_stats_requires_admin(client, auth_headers):
    response = await client.get("/studio/admin/stats", headers=auth_headers)
    assert response.status_code == 403


async def test_stats_returns_200(client, admin_headers):
    response = await client.get("/studio/admin/stats", headers=admin_headers)
    assert response.status_code == 200


async def test_stats_has_six_groups(client, admin_headers):
    response = await client.get("/studio/admin/stats", headers=admin_headers)
    data = response.json()
    labels = [g["label"] for g in data["groups"]]
    assert labels == ["Catalog", "Session", "Tools", "Config", "GearList", "Scanner"]


async def test_stats_has_all_tables(client, admin_headers):
    response = await client.get("/studio/admin/stats", headers=admin_headers)
    data = response.json()
    all_names = {t["name"] for g in data["groups"] for t in g["tables"]}
    expected = {
        "Brands", "Models",
        "Effects", "Instruments", "Libraries", "Workstations",
        "Admin", "Composition", "Measurement", "Reference", "Workflow",
        "Effect Types", "Entity Types", "Instrument Types",
        "Model Types", "Plugin Formats", "Tag Types", "Tool Types",
        "Gear", "Gear Types",
        "Scans", "Scan Results", "Vendor Rules", "Name Rules", "Name Patterns",
        "Aliases", "Exclusions", "Links", "Rejections",
    }
    assert all_names == expected


async def test_stats_has_scanner_group(client, admin_headers):
    """The Scanner group lists the scanner content/rule tables (api keys excluded)."""
    response = await client.get("/studio/admin/stats", headers=admin_headers)
    data = response.json()
    scanner = next((g for g in data["groups"] if g["label"] == "Scanner"), None)
    assert scanner is not None, "expected a 'Scanner' stat group"
    names = {t["name"] for t in scanner["tables"]}
    assert names == {
        "Scans", "Scan Results",
        "Vendor Rules", "Name Rules", "Name Patterns",
        "Aliases", "Exclusions", "Links", "Rejections",
    }


async def test_stats_total_equals_sum_of_counts(client, admin_headers):
    response = await client.get("/studio/admin/stats", headers=admin_headers)
    data = response.json()
    computed = sum(t["count"] for g in data["groups"] for t in g["tables"])
    assert data["total"] == computed


async def test_stats_groups_sorted_by_count_desc(client, admin_headers):
    """Within each group, tables are sorted count desc, then name asc as tie-break."""
    response = await client.get("/studio/admin/stats", headers=admin_headers)
    data = response.json()
    for group in data["groups"]:
        counts = [t["count"] for t in group["tables"]]
        assert counts == sorted(counts, reverse=True)


async def test_stats_groups_sorted_by_name_asc_on_equal_count(client, admin_headers):
    """When counts are equal, tables should be sorted by display name ascending."""
    response = await client.get("/studio/admin/stats", headers=admin_headers)
    data = response.json()
    for group in data["groups"]:
        # Find tables with equal count to each other and verify name ordering
        tables = group["tables"]
        for i in range(len(tables) - 1):
            if tables[i]["count"] == tables[i + 1]["count"]:
                assert tables[i]["name"] <= tables[i + 1]["name"], (
                    f"In group '{group['label']}': '{tables[i]['name']}' should come "
                    f"before '{tables[i+1]['name']}' alphabetically when counts are equal"
                )


async def test_stats_count_reflects_inserted_row(client, admin_headers, conn):
    """Inserting a row bumps the relevant table count by 1."""
    before = await client.get("/studio/admin/stats", headers=admin_headers)
    brands_before = _find_stat(before.json(), "Brands")["count"]

    await conn.execute(
        "INSERT INTO brands (brand_name) VALUES ('__test_brand__')"
    )

    after = await client.get("/studio/admin/stats", headers=admin_headers)
    brands_after = _find_stat(after.json(), "Brands")["count"]
    assert brands_after == brands_before + 1


async def test_stats_table_stat_has_pending_fields(client, admin_headers):
    """Each table stat must include pending_creates, pending_deletes, pending_updates."""
    response = await client.get("/studio/admin/stats", headers=admin_headers)
    data = response.json()
    for group in data["groups"]:
        for table in group["tables"]:
            assert "pending_creates" in table
            assert "pending_deletes" in table
            assert "pending_updates" in table


async def test_stats_pending_creates_excluded_from_count(client, admin_headers, conn):
    """A pending CREATE entry does not increase the displayed count."""
    before = await client.get("/studio/admin/stats", headers=admin_headers)
    before_stat = _find_stat(before.json(), "Brands")

    brand_id = await conn.fetchval(
        "INSERT INTO brands (brand_name) VALUES ('__pending_test__') RETURNING brand_id"
    )
    await conn.execute(
        """INSERT INTO audit_log
               (table_name, record_id, operation, performed_by, new_data)
           VALUES ('brands', $1, 'CREATE', 'admin', '{}')""",
        brand_id,
    )

    after = await client.get("/studio/admin/stats", headers=admin_headers)
    after_stat = _find_stat(after.json(), "Brands")
    # The new row is pending — displayed count should not change
    assert after_stat["count"] == before_stat["count"]
    assert after_stat["pending_creates"] == before_stat["pending_creates"] + 1


async def test_stats_pending_deletes_added_to_count(client, admin_headers, conn):
    """A pending DELETE entry increases the displayed count by 1 above the baseline."""
    before = await client.get("/studio/admin/stats", headers=admin_headers)
    before_stat = _find_stat(before.json(), "Brands")

    brand_id = await conn.fetchval(
        "INSERT INTO brands (brand_name) VALUES ('__del_test__') RETURNING brand_id"
    )
    await conn.execute(
        "UPDATE brands SET deleted_at = NOW() WHERE brand_id = $1", brand_id
    )
    await conn.execute(
        """INSERT INTO audit_log
               (table_name, record_id, operation, performed_by, old_data)
           VALUES ('brands', $1, 'DELETE', 'admin', '{}')""",
        brand_id,
    )

    after = await client.get("/studio/admin/stats", headers=admin_headers)
    after_stat = _find_stat(after.json(), "Brands")
    # The soft-deleted row has a pending delete — displayed count increases by 1
    assert after_stat["count"] == before_stat["count"] + 1
    assert after_stat["pending_deletes"] == before_stat["pending_deletes"] + 1


async def test_stats_pending_updates_no_count_change(client, admin_headers, conn):
    """A pending UPDATE entry does not change the displayed count relative to inserting the row."""
    before = await client.get("/studio/admin/stats", headers=admin_headers)
    before_stat = _find_stat(before.json(), "Brands")

    brand_id = await conn.fetchval(
        "INSERT INTO brands (brand_name) VALUES ('__upd_test__') RETURNING brand_id"
    )
    await conn.execute(
        """INSERT INTO audit_log
               (table_name, record_id, operation, performed_by, old_data, new_data)
           VALUES ('brands', $1, 'UPDATE', 'admin', '{}', '{}')""",
        brand_id,
    )

    after = await client.get("/studio/admin/stats", headers=admin_headers)
    after_stat = _find_stat(after.json(), "Brands")
    # Active row + no pending create/delete adjustment → count increases by 1
    assert after_stat["count"] == before_stat["count"] + 1
    assert after_stat["pending_updates"] == before_stat["pending_updates"] + 1
