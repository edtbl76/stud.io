#!/bin/bash
# =============================================================================
# STUD.io ControlRoom — App
# Starts all containers and runs the backend test suite
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "============================================================"
echo "  STUD.io ControlRoom"
echo "============================================================"

# ---------------------------------------------------------------------------
# 1. Start Docker containers
# ---------------------------------------------------------------------------
echo ""
echo "[1/4] Starting Docker containers..."
cd "$SCRIPT_DIR"
docker compose up -d --build

# ---------------------------------------------------------------------------
# 2. Wait for PostgreSQL
# ---------------------------------------------------------------------------
echo ""
echo "[2/4] Waiting for services..."
echo -n "  PostgreSQL "
until docker compose exec db pg_isready -U studio -q 2>/dev/null; do
    echo -n "."
    sleep 1
done
echo " ready"

echo -n "  API        "
until curl -sf http://localhost:5150/health > /dev/null 2>&1; do
    echo -n "."
    sleep 1
done
echo " ready"

echo -n "  Frontend   "
until curl -sf http://localhost:2112 > /dev/null 2>&1; do
    echo -n "."
    sleep 2
done
echo " ready"

# ---------------------------------------------------------------------------
# 3. Apply semantic views to both databases
# ---------------------------------------------------------------------------
echo ""
echo "[3/4] Applying semantic views..."
docker compose exec -T db psql -U studio -d controlroomdb      -f - < "$SCRIPT_DIR/sql/views.sql" > /dev/null
docker compose exec -T db psql -U studio -d controlroomdb_test -f - < "$SCRIPT_DIR/sql/views.sql" > /dev/null
echo "  Views applied"

# ---------------------------------------------------------------------------
# 4. Run backend test suite
# ---------------------------------------------------------------------------
echo ""
echo "[4/4] Running tests..."
cd "$SCRIPT_DIR/app/controlroom_backend"
python -m pytest tests/ -v

echo ""
echo "============================================================"
echo "  All systems go."
echo ""
echo "  App:  http://localhost:2112"
echo "  API:  http://localhost:5150"
echo "  Docs: http://localhost:5150/docs"
echo "============================================================"
