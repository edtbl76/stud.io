"""Property-based tests for U-09 `_apply_collisions` (pure cross-row grouping).

Invariants over arbitrary workbench-row sets:
- soundness + completeness: a row is bucketed `collision` iff it belongs to an
  eligible group — same `(table, record_id, casefold(format))` — with ≥2 distinct paths.
- copy integrity: every collision row's copies share its record + format and span ≥2 paths.
- symmetry: collision rows in the same group expose the identical copy set.
- isolation: non-collision rows keep `collision is None`.
"""
from __future__ import annotations

import uuid
from collections import defaultdict

from hypothesis import given, settings
from hypothesis import strategies as st

from routers.scanner_workbench import _apply_collisions
from schemas.scanner_workbench import WorkbenchRow

_IDS = [uuid.UUID(int=i) for i in range(1, 4)]      # small pool → forces grouping overlap
_TABLES = ["effects", "instruments"]
_FORMATS = ["vst3", "au", "VST3"]                   # includes a case variant for casefold
_PATHS = ["/p/a", "/p/b", "/p/c"]

# A generated row spec: (catalog_record_id | None, table, format, path)
_Spec = tuple


def _row(result_id: uuid.UUID, spec: _Spec) -> WorkbenchRow:
    rec_id, table, fmt, path = spec
    return WorkbenchRow(
        result_id=result_id, disk_name="n", disk_vendor="v", disk_version="1.0",
        disk_format=fmt, disk_path=path, display_name="n", display_vendor="v",
        catalog_record_id=rec_id, catalog_record_table=(table if rec_id is not None else None),
        bucket="needs_review",
    )


@st.composite
def _rows(draw) -> list[WorkbenchRow]:
    specs = draw(st.lists(
        st.tuples(
            st.one_of(st.none(), st.sampled_from(_IDS)),
            st.sampled_from(_TABLES), st.sampled_from(_FORMATS), st.sampled_from(_PATHS),
        ),
        max_size=8,
    ))
    return [_row(uuid.UUID(int=1000 + i), spec) for i, spec in enumerate(specs)]


def _eligible_groups(rows: list[WorkbenchRow]) -> dict[tuple, list[WorkbenchRow]]:
    groups: dict[tuple, list[WorkbenchRow]] = defaultdict(list)
    for r in rows:
        if r.catalog_record_id is not None:
            groups[(r.catalog_record_table, r.catalog_record_id, r.disk_format.casefold())].append(r)
    return groups


def _expected_collision_ids(rows: list[WorkbenchRow]) -> set:
    return {
        m.result_id
        for members in _eligible_groups(rows).values()
        if len({m.disk_path for m in members}) >= 2
        for m in members
    }


def _assert_copy_integrity(row: WorkbenchRow) -> None:
    if row.bucket != "collision":
        assert row.collision is None
        return
    assert row.collision is not None
    assert len({c.path for c in row.collision.copies}) >= 2
    assert row.collision.shared_catalog_record.id == row.catalog_record_id
    assert all(c.format.casefold() == row.disk_format.casefold() for c in row.collision.copies)


def _assert_symmetry(result: list[WorkbenchRow]) -> None:
    by_group: dict[tuple, list[WorkbenchRow]] = defaultdict(list)
    for r in result:
        if r.bucket == "collision":
            by_group[(r.catalog_record_table, r.catalog_record_id, r.disk_format.casefold())].append(r)
    for members in by_group.values():
        copy_sets = [frozenset(c.result_id for c in m.collision.copies) for m in members]
        assert all(s == copy_sets[0] for s in copy_sets)


@settings(max_examples=200)
@given(_rows())
def test_collision_grouping_invariants(rows: list[WorkbenchRow]) -> None:
    result = _apply_collisions(rows)
    assert {r.result_id for r in result if r.bucket == "collision"} == _expected_collision_ids(rows)
    for row in result:
        _assert_copy_integrity(row)
    _assert_symmetry(result)
