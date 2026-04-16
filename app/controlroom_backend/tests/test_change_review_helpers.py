import uuid
import pytest
from datetime import datetime, timezone
from routers._helpers import AuditEntry, ChangeReviewResponse, _TABLE_PK
from routers.change_review_list import _build_entries, _build_filter_clause


def test_audit_entry_model():
    entry = AuditEntry(
        audit_id=uuid.uuid4(),
        table_name="effects",
        record_id=uuid.uuid4(),
        operation="DELETE",
        performed_by="admin",
        performed_at=datetime.now(timezone.utc),
        acknowledged_at=None,
        acknowledged_by=None,
        undone_at=None,
        undone_by=None,
    )
    assert entry.record_display_name is None


def test_change_review_response_model():
    resp = ChangeReviewResponse(total=0, page=1, page_size=50, entries=[])
    assert resp.entries == []


def test_table_pk_covers_all_18_tables():
    expected = {
        "brands", "models",
        "effects", "instruments", "libraries", "workstations",
        "admin_tools", "composition_tools", "measurement_tools",
        "reference_tools", "workflow_tools",
        "effect_types", "entity_types", "instrument_types",
        "model_types", "plugin_formats", "tag_types", "tool_types",
    }
    assert set(_TABLE_PK.keys()) == expected


# ---------------------------------------------------------------------------
# _build_filter_clause
# ---------------------------------------------------------------------------

def test_build_filter_clause_pending_no_extras():
    where, params = _build_filter_clause("pending", None, None)
    assert "acknowledged_at IS NULL" in where
    assert params == []


def test_build_filter_clause_all_returns_empty_where():
    where, params = _build_filter_clause("all", None, None)
    assert where == ""
    assert params == []


def test_build_filter_clause_with_table_and_operation():
    where, params = _build_filter_clause("all", "brands", "DELETE")
    assert "$1" in where
    assert "$2" in where
    assert params == ["brands", "DELETE"]


# ---------------------------------------------------------------------------
# _build_entries
# ---------------------------------------------------------------------------

def _make_audit_row(table_name: str, record_id=None) -> dict:
    """Build a minimal audit row dict for _build_entries unit tests."""
    return {
        "audit_id": uuid.uuid4(),
        "table_name": table_name,
        "record_id": record_id if record_id is not None else uuid.uuid4(),
        "operation": "DELETE",
        "performed_by": "admin",
        "performed_at": datetime.now(timezone.utc),
        "acknowledged_at": None,
        "acknowledged_by": None,
        "undone_at": None,
        "undone_by": None,
    }


@pytest.mark.parametrize(
    ("table", "make_names", "get_expected"),
    [
        pytest.param(
            "brands",
            lambda rid: {("brands", rid): "Test Brand"},
            lambda _rid: "Test Brand",
            id="uses_display_names_lookup",
        ),
        pytest.param(
            "brands",
            lambda _rid: {},
            lambda rid: str(rid)[:8],
            id="falls_back_to_id_prefix_for_known_table",
        ),
        pytest.param(
            "unknown_table",
            lambda _rid: {},
            lambda _rid: None,
            id="returns_none_for_unknown_table",
        ),
    ],
)
def test_build_entries(table: str, make_names, get_expected) -> None:
    record_id = uuid.uuid4()
    row = _make_audit_row(table, record_id)
    entries = _build_entries([row], make_names(record_id))  # type: ignore[arg-type]
    assert entries[0].record_display_name == get_expected(record_id)
