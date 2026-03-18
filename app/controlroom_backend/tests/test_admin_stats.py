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
