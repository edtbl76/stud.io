#!/bin/bash
# =============================================================================
# STUD.io ControlRoom — App
# Starts infrastructure and runs the backend test suite
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "============================================================"
echo "  STUD.io ControlRoom"
echo "  API:  http://localhost:5150"
echo "  Docs: http://localhost:5150/docs"
echo "============================================================"

# ---------------------------------------------------------------------------
# 1. Start Docker containers if not running
# ---------------------------------------------------------------------------
echo ""
echo "[1/3] Checking Docker containers..."
cd "$SCRIPT_DIR"

if ! docker compose ps | grep -q "running"; then
    echo "  Starting containers..."
    docker compose up -d --build
    echo "  Waiting for PostgreSQL to be ready..."
    until docker compose exec db pg_isready -U studio -q; do
        sleep 1
    done
    echo "  PostgreSQL is ready"
else
    echo "  Containers already running"
fi

# ---------------------------------------------------------------------------
# 2. Apply semantic views to both databases
# ---------------------------------------------------------------------------
echo ""
echo "[2/3] Applying semantic views..."
docker compose exec -T db psql -U studio -d controlroomdb      -f - < "$SCRIPT_DIR/sql/views.sql" > /dev/null
docker compose exec -T db psql -U studio -d controlroomdb_test -f - < "$SCRIPT_DIR/sql/views.sql" > /dev/null
echo "  Views applied"

# ---------------------------------------------------------------------------
# 3. Run test suite
# ---------------------------------------------------------------------------
echo ""
echo "[3/3] Running tests..."
cd "$SCRIPT_DIR/app/controlroom_backend"
python -m pytest tests/ -v

echo ""
echo "============================================================"
echo "  All tests passed."
echo "  API:  http://localhost:5150"
echo "  Docs: http://localhost:5150/docs"
echo "============================================================"
