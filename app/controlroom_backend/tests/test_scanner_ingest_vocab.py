"""U-08 Vocabulary Frozen-Snapshot — ingest status derivation (five-bucket vocab).

`_assign_status` maps a match outcome to one of the five stored values:
known, needs_review, unlinked, orphaned, excluded. (orphaned/excluded are not
assigned here — orphaned comes from the catalog-absence path, excluded from user
actions.) These direct unit tests restore the ingest-classification coverage that
lived in the legacy-report-coupled test_scanner_known_matched.py (retired in U-08).
"""
from __future__ import annotations

import pytest

from routers.scanner_ingest import (
    _apply_collision_override,
    _assign_status,
    _summary_counts,
)

_DISK_PATHS = [{"path": "/Library/VST3/Reverb.vst3", "format": "vst3", "version": "2.0"}]


def _row(ident, path, status):
    """Build an ingest row tuple. ``ident`` = (name, vendor, format).

    Layout: (scan_id,name,vendor,version,format,path,status,confidence,score,record_id,record_table,metadata_source)
    """
    name, vendor, fmt = ident
    return (None, name, vendor, "1.0", fmt, path, status, "exact", 100.0, None, None, "vst3")


_PQ = ("Pro-Q 3", "FabFilter", "vst3")     # base identity for collision tests
_PQ_AU = ("Pro-Q 3", "FabFilter", "au")    # same name/vendor, different format


def test_no_match_is_unlinked():
    assert _assign_status("none", "2.0", None) == "unlinked"


def test_exact_version_mismatch_is_needs_review():
    assert _assign_status("exact", "2.0", "1.0", _DISK_PATHS) == "needs_review"


def test_exact_versions_agree_with_disk_paths_is_known():
    assert _assign_status("exact", "2.0", "2.0", _DISK_PATHS) == "known"


def test_exact_versions_agree_without_disk_paths_is_needs_review():
    # Q1=A: an exact, version-agreeing match not yet reconciled (no disk_paths)
    # needs user confirmation, so it is needs_review rather than known.
    assert _assign_status("exact", "2.0", "2.0", None) == "needs_review"
    assert _assign_status("exact", "2.0", "2.0", []) == "needs_review"


def test_fuzzy_match_is_needs_review():
    assert _assign_status("fuzzy", "2.0", "2.0", _DISK_PATHS) == "needs_review"


def test_no_retired_vocabulary_returned():
    retired = {"matched", "conflicted", "unconfirmed", "untracked", "ignored"}
    cases = [
        ("none", "2.0", None, None),
        ("exact", "2.0", "1.0", _DISK_PATHS),
        ("exact", "2.0", "2.0", _DISK_PATHS),
        ("exact", "2.0", "2.0", None),
        ("fuzzy", "2.0", "2.0", _DISK_PATHS),
    ]
    for conf, dv, rv, dp in cases:
        assert _assign_status(conf, dv, rv, dp) not in retired


# ---------------------------------------------------------------------------
# Step 2 — collision overrides Known (Q3)
# ---------------------------------------------------------------------------

def _statuses(rows):
    return [r[6] for r in rows]


def test_collision_downgrades_known_to_needs_review():
    rows = [
        _row(_PQ, "/a/ProQ.vst3", "known"),
        _row(_PQ, "/b/ProQ.vst3", "known"),
    ]
    assert _statuses(_apply_collision_override(rows)) == ["needs_review", "needs_review"]


def test_no_collision_when_same_path():
    rows = [
        _row(_PQ, "/a/ProQ.vst3", "known"),
        _row(_PQ, "/a/ProQ.vst3", "known"),
    ]
    assert _statuses(_apply_collision_override(rows)) == ["known", "known"]


def test_different_format_is_not_a_collision():
    rows = [
        _row(_PQ, "/a/ProQ.vst3", "known"),
        _row(_PQ_AU, "/b/ProQ.component", "known"),
    ]
    assert _statuses(_apply_collision_override(rows)) == ["known", "known"]


def test_collision_only_touches_known_rows():
    rows = [
        _row(_PQ, "/a/ProQ.vst3", "needs_review"),
        _row(_PQ, "/b/ProQ.vst3", "unlinked"),
    ]
    assert _statuses(_apply_collision_override(rows)) == ["needs_review", "unlinked"]


def test_no_collision_returns_rows_unchanged():
    rows = [_row(("Serum", "Xfer", "vst3"), "/a/Serum.vst3", "known")]
    assert _apply_collision_override(rows) == rows


# ---------------------------------------------------------------------------
# Step 3 — summary counts use single-value filters
# ---------------------------------------------------------------------------

async def _insert_status_row(conn, scan_id, status):
    await conn.execute(
        "INSERT INTO plugin_scan_results (scan_id,name,vendor,version,format,path,status,confidence) "
        "VALUES ($1,$2,$3,'1.0','vst3','/p',$4,'exact')",
        scan_id, f"n-{status}", f"v-{status}", status,
    )


@pytest.mark.asyncio
async def test_summary_counts_one_per_bucket(conn):
    scan_id = await conn.fetchval(
        "INSERT INTO plugin_scans (source_machine, total_count) VALUES ('m', 5) RETURNING scan_id"
    )
    for st in ("known", "needs_review", "unlinked", "orphaned", "excluded"):
        await _insert_status_row(conn, scan_id, st)
    counts = await _summary_counts(conn, scan_id)
    assert counts == {"known": 1, "needs_review": 1, "unlinked": 1, "orphaned": 1, "excluded": 1}
