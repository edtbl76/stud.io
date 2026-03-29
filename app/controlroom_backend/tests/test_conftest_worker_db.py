import re


def _resolve_db(worker_env):
    if worker_env:
        m = re.match(r"gw(\d+)", worker_env)
        return f"controlroomdb_test_{m.group(1)}" if m else f"controlroomdb_test_{worker_env}"
    return "controlroomdb_test"


def test_single_process_uses_default_db():
    assert _resolve_db("") == "controlroomdb_test"


def test_worker_0_uses_db_0():
    assert _resolve_db("gw0") == "controlroomdb_test_0"


def test_worker_3_uses_db_3():
    assert _resolve_db("gw3") == "controlroomdb_test_3"
