"""Integration tests for the atomic collision-resolve endpoint.

POST /scanner/collisions/resolve resolves a whole collision (duplicate installs
of the same plugin at different paths) in a single transaction:
  - keep_all:        acknowledge every copy
  - remove_straggler: acknowledge the keeper, dismiss the rest
Either the whole set applies or none of it does (all-or-nothing), unlike the
per-item /confirm loop and the frontend's N+1 acknowledge/dismiss calls.
"""
from __future__ import annotations

import pytest


async def _insert_effect(conn) -> str:
    return str(await conn.fetchval(
        "INSERT INTO effects (effect_name) VALUES ($1) RETURNING effect_id",
        "Collision Test Effect",
    ))


async def _insert_copies(conn, effect_id: str | None, n: int) -> list[str]:
    """Insert n collision copies (same name/vendor/format, different paths).

    When effect_id is None the copies have no linked catalog record, so
    acknowledging them raises — used to exercise the rollback path.
    """
    scan_id = await conn.fetchval(
        "INSERT INTO plugin_scans (source_machine, total_count) VALUES ($1,$2) RETURNING scan_id",
        "test-machine", n,
    )
    ids: list[str] = []
    for i in range(n):
        rid = await conn.fetchval(
            "INSERT INTO plugin_scan_results "
            "(scan_id, name, vendor, version, format, path, status, "
            " confidence, score, record_id, record_table) "
            "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING result_id",
            scan_id, "Reverb Pro", "Acme Audio", "2.0", "vst3",
            f"/Library/VST3/Reverb-{i}.vst3", "needs_review",
            "exact", 100.0, effect_id, "effects" if effect_id else None,
        )
        ids.append(str(rid))
    return ids


async def _resolve(client, headers, body: dict):
    return await client.post("/scanner/collisions/resolve", json=body, headers=headers)


async def _confirmed(conn, rid) -> bool:
    return (await conn.fetchval(
        "SELECT confirmed_at IS NOT NULL FROM plugin_scan_results WHERE result_id=$1::uuid", rid
    )) is True


async def _dismissed(conn, rid) -> bool:
    return (await conn.fetchval(
        "SELECT dismissed_at IS NOT NULL FROM plugin_scan_results WHERE result_id=$1::uuid", rid
    )) is True


@pytest.mark.asyncio
async def test_keep_all_acknowledges_every_copy(client, conn, admin_headers):
    effect_id = await _insert_effect(conn)
    ids = await _insert_copies(conn, effect_id, 3)

    resp = await _resolve(client, admin_headers, {"action": "keep_all", "copy_ids": ids})

    assert resp.status_code == 200
    assert resp.json()["acknowledged"] == 3
    for rid in ids:
        assert await _confirmed(conn, rid)


@pytest.mark.asyncio
async def test_remove_straggler_acknowledges_keeper_and_dismisses_rest(client, conn, admin_headers):
    effect_id = await _insert_effect(conn)
    ids = await _insert_copies(conn, effect_id, 3)
    keeper = ids[0]

    resp = await _resolve(
        client, admin_headers, {"action": "remove_straggler", "copy_ids": ids, "keeper_id": keeper}
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["acknowledged"] == 1
    assert data["dismissed"] == 2
    assert await _confirmed(conn, keeper)
    assert not await _dismissed(conn, keeper)
    for rid in ids[1:]:
        assert await _dismissed(conn, rid)
        assert not await _confirmed(conn, rid)


@pytest.mark.asyncio
async def test_keep_all_is_atomic_rolls_back_on_a_bad_copy(client, conn, admin_headers):
    """If one copy cannot be acknowledged, NONE of the set is confirmed."""
    effect_id = await _insert_effect(conn)
    good = await _insert_copies(conn, effect_id, 2)
    bad = await _insert_copies(conn, None, 1)  # no linked record → acknowledge raises
    ids = good + bad

    resp = await _resolve(client, admin_headers, {"action": "keep_all", "copy_ids": ids})

    assert resp.status_code == 400
    # rollback: not even the good copies were confirmed
    for rid in good:
        assert not await _confirmed(conn, rid)


@pytest.mark.asyncio
async def test_remove_straggler_requires_keeper_id(client, conn, admin_headers):
    effect_id = await _insert_effect(conn)
    ids = await _insert_copies(conn, effect_id, 2)

    resp = await _resolve(client, admin_headers, {"action": "remove_straggler", "copy_ids": ids})

    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_remove_straggler_keeper_must_be_in_copy_ids(client, conn, admin_headers):
    effect_id = await _insert_effect(conn)
    ids = await _insert_copies(conn, effect_id, 2)
    stranger = str(await conn.fetchval("SELECT gen_random_uuid()"))

    resp = await _resolve(
        client, admin_headers, {"action": "remove_straggler", "copy_ids": ids, "keeper_id": stranger}
    )

    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_empty_copy_ids_rejected(client, conn, admin_headers):
    resp = await _resolve(client, admin_headers, {"action": "keep_all", "copy_ids": []})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_unknown_action_rejected(client, conn, admin_headers):
    effect_id = await _insert_effect(conn)
    ids = await _insert_copies(conn, effect_id, 1)
    resp = await _resolve(client, admin_headers, {"action": "nuke", "copy_ids": ids})
    assert resp.status_code == 422


# ── remove_straggler validates the collision set before dismissing anything ──


@pytest.mark.asyncio
async def test_remove_straggler_rejects_duplicate_copy_ids(client, conn, admin_headers):
    effect_id = await _insert_effect(conn)
    ids = await _insert_copies(conn, effect_id, 2)
    resp = await _resolve(
        client, admin_headers,
        {"action": "remove_straggler", "copy_ids": [ids[0], ids[0]], "keeper_id": ids[0]},
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_remove_straggler_rejects_unknown_copy_id(client, conn, admin_headers):
    effect_id = await _insert_effect(conn)
    ids = await _insert_copies(conn, effect_id, 2)
    stranger = str(await conn.fetchval("SELECT gen_random_uuid()"))
    resp = await _resolve(
        client, admin_headers,
        {"action": "remove_straggler", "copy_ids": [ids[0], stranger], "keeper_id": ids[0]},
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_remove_straggler_rejects_incomplete_collision_set(client, conn, admin_headers):
    """A collision member left out of copy_ids is rejected — no partial resolution."""
    effect_id = await _insert_effect(conn)
    ids = await _insert_copies(conn, effect_id, 3)  # a 3-copy collision
    resp = await _resolve(
        client, admin_headers,
        {"action": "remove_straggler", "copy_ids": ids[:2], "keeper_id": ids[0]},  # only 2 of 3
    )
    assert resp.status_code == 400
    for rid in ids:  # nothing dismissed — validation ran before any mutation
        assert not await _dismissed(conn, rid)


@pytest.mark.asyncio
async def test_remove_straggler_rejects_copies_from_two_collisions(client, conn, admin_headers):
    a = await _insert_copies(conn, await _insert_effect(conn), 2)
    b = await _insert_copies(conn, await _insert_effect(conn), 2)
    resp = await _resolve(
        client, admin_headers,
        {"action": "remove_straggler", "copy_ids": a + b, "keeper_id": a[0]},
    )
    assert resp.status_code == 400
