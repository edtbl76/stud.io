# tests/test_admin_stats.py


async def test_stats_requires_auth(client):
    response = await client.get("/admin/stats")
    assert response.status_code == 401


async def test_stats_requires_admin(client, auth_headers):
    response = await client.get("/admin/stats", headers=auth_headers)
    assert response.status_code == 403


async def test_stats_returns_200(client, admin_headers):
    response = await client.get("/admin/stats", headers=admin_headers)
    assert response.status_code == 200


async def test_stats_has_four_groups(client, admin_headers):
    response = await client.get("/admin/stats", headers=admin_headers)
    data = response.json()
    labels = [g["label"] for g in data["groups"]]
    assert labels == ["Catalog", "Session", "Tools", "Config"]


async def test_stats_has_all_18_tables(client, admin_headers):
    response = await client.get("/admin/stats", headers=admin_headers)
    data = response.json()
    all_names = [t["name"] for g in data["groups"] for t in g["tables"]]
    expected = {
        "Brands", "Models",
        "Effects", "Instruments", "Libraries", "Workstations",
        "Admin", "Composition", "Measurement", "Reference", "Workflow",
        "Effect Types", "Entity Types", "Instrument Types",
        "Model Types", "Plugin Formats", "Tag Types", "Tool Types",
    }
    assert set(all_names) == expected


async def test_stats_total_equals_sum_of_counts(client, admin_headers):
    response = await client.get("/admin/stats", headers=admin_headers)
    data = response.json()
    computed = sum(t["count"] for g in data["groups"] for t in g["tables"])
    assert data["total"] == computed


async def test_stats_groups_sorted_by_count_desc(client, admin_headers):
    """Within each group, tables are sorted count desc, then name asc as tie-break."""
    response = await client.get("/admin/stats", headers=admin_headers)
    data = response.json()
    for group in data["groups"]:
        counts = [t["count"] for t in group["tables"]]
        assert counts == sorted(counts, reverse=True)


async def test_stats_groups_sorted_by_name_asc_on_equal_count(client, admin_headers):
    """When counts are equal, tables should be sorted by display name ascending."""
    response = await client.get("/admin/stats", headers=admin_headers)
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
    before = await client.get("/admin/stats", headers=admin_headers)
    brands_before = next(
        t["count"]
        for g in before.json()["groups"]
        for t in g["tables"]
        if t["name"] == "Brands"
    )

    await conn.execute(
        "INSERT INTO brands (brand_name) VALUES ('__test_brand__')"
    )

    after = await client.get("/admin/stats", headers=admin_headers)
    brands_after = next(
        t["count"]
        for g in after.json()["groups"]
        for t in g["tables"]
        if t["name"] == "Brands"
    )
    assert brands_after == brands_before + 1


async def test_stats_table_stat_has_pending_fields(client, admin_headers):
    """Each table stat must include pending_creates, pending_deletes, pending_updates."""
    response = await client.get("/admin/stats", headers=admin_headers)
    data = response.json()
    for group in data["groups"]:
        for table in group["tables"]:
            assert "pending_creates" in table
            assert "pending_deletes" in table
            assert "pending_updates" in table


async def test_stats_pending_creates_excluded_from_count(client, admin_headers, conn):
    """A pending CREATE entry causes the displayed count to be one less than active rows."""
    # Insert a brand so there is an active row
    brand_id = await conn.fetchval(
        "INSERT INTO brands (brand_name) VALUES ('__pending_test__') RETURNING brand_id"
    )
    # Simulate a pending CREATE audit entry for that brand
    await conn.execute(
        """INSERT INTO audit_log
               (table_name, record_id, operation, performed_by, new_data)
           VALUES ('brands', $1, 'CREATE', 'admin', '{}')""",
        brand_id,
    )

    before_active = await conn.fetchval(
        "SELECT COUNT(*)::int FROM brands WHERE deleted_at IS NULL"
    )

    response = await client.get("/admin/stats", headers=admin_headers)
    data = response.json()
    brands_stat = next(
        t for g in data["groups"] for t in g["tables"] if t["name"] == "Brands"
    )
    # displayed count = active - pending_creates + pending_deletes
    assert brands_stat["count"] == before_active - 1
    # pending_creates should have increased by exactly 1 from the baseline
    baseline = await conn.fetchval(
        """SELECT COUNT(*)::int FROM audit_log
           WHERE table_name = 'brands' AND operation = 'CREATE'
             AND acknowledged_at IS NULL AND undone_at IS NULL
             AND record_id != $1""",
        brand_id,
    )
    assert brands_stat["pending_creates"] == baseline + 1


async def test_stats_pending_deletes_added_to_count(client, admin_headers, conn):
    """A pending DELETE entry causes the displayed count to be one more than active rows."""
    # Insert and soft-delete a brand
    brand_id = await conn.fetchval(
        "INSERT INTO brands (brand_name) VALUES ('__del_test__') RETURNING brand_id"
    )
    await conn.execute(
        "UPDATE brands SET deleted_at = NOW() WHERE brand_id = $1", brand_id
    )
    # Simulate a pending DELETE audit entry
    await conn.execute(
        """INSERT INTO audit_log
               (table_name, record_id, operation, performed_by, old_data)
           VALUES ('brands', $1, 'DELETE', 'admin', '{}')""",
        brand_id,
    )

    active_count = await conn.fetchval(
        "SELECT COUNT(*)::int FROM brands WHERE deleted_at IS NULL"
    )

    response = await client.get("/admin/stats", headers=admin_headers)
    data = response.json()
    brands_stat = next(
        t for g in data["groups"] for t in g["tables"] if t["name"] == "Brands"
    )
    assert brands_stat["count"] == active_count + 1
    baseline = await conn.fetchval(
        """SELECT COUNT(*)::int FROM audit_log
           WHERE table_name = 'brands' AND operation = 'DELETE'
             AND acknowledged_at IS NULL AND undone_at IS NULL
             AND record_id != $1""",
        brand_id,
    )
    assert brands_stat["pending_deletes"] == baseline + 1


async def test_stats_pending_updates_no_count_change(client, admin_headers, conn):
    """A pending UPDATE entry does not change the displayed count."""
    brand_id = await conn.fetchval(
        "INSERT INTO brands (brand_name) VALUES ('__upd_test__') RETURNING brand_id"
    )
    await conn.execute(
        """INSERT INTO audit_log
               (table_name, record_id, operation, performed_by, old_data, new_data)
           VALUES ('brands', $1, 'UPDATE', 'admin', '{}', '{}')""",
        brand_id,
    )

    active_count = await conn.fetchval(
        "SELECT COUNT(*)::int FROM brands WHERE deleted_at IS NULL"
    )

    response = await client.get("/admin/stats", headers=admin_headers)
    data = response.json()
    brands_stat = next(
        t for g in data["groups"] for t in g["tables"] if t["name"] == "Brands"
    )
    assert brands_stat["count"] == active_count
    baseline = await conn.fetchval(
        """SELECT COUNT(*)::int FROM audit_log
           WHERE table_name = 'brands' AND operation = 'UPDATE'
             AND acknowledged_at IS NULL AND undone_at IS NULL
             AND record_id != $1""",
        brand_id,
    )
    assert brands_stat["pending_updates"] == baseline + 1
