#!/bin/bash
# =============================================================================
# STUD.io ControlRoom — App
# Starts all containers and runs the backend test suite
#
# Usage:
#   ./app.sh           # Start studio stack only
#   ./app.sh --dev     # Start studio stack + dev tooling (SonarQube)
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Parse flags
WITH_DEV=false
for arg in "$@"; do
  case "$arg" in
    --dev) WITH_DEV=true ;;
    *) echo "Unknown flag: $arg"; exit 1 ;;
  esac
done

echo "============================================================"
echo "  STUD.io ControlRoom"
if $WITH_DEV; then echo "  (+ dev stack)"; fi
echo "============================================================"

# ---------------------------------------------------------------------------
# 1. Start Docker containers
# ---------------------------------------------------------------------------
echo ""
echo "[1/4] Starting Docker containers..."
cd "$SCRIPT_DIR"
docker compose up -d --build

if $WITH_DEV; then
  bash "$SCRIPT_DIR/scripts/dev.sh" up
fi

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
until curl -sfk https://localhost:5150/health > /dev/null 2>&1; do
    echo -n "."
    sleep 1
done
echo " ready"

echo -n "  Frontend   "
until curl -sfk https://localhost:2112 > /dev/null 2>&1; do
    echo -n "."
    sleep 2
done
echo " ready"

# ---------------------------------------------------------------------------
# 3. Apply schema and semantic views to both databases
# ---------------------------------------------------------------------------
echo ""
echo "[3/4] Applying schema and semantic views..."
docker compose exec -T db psql -U studio -d controlroomdb      -f - < "$SCRIPT_DIR/sql/schema.sql" > /dev/null
docker compose exec -T db psql -U studio -d controlroomdb_test -f - < "$SCRIPT_DIR/sql/schema.sql" > /dev/null
docker compose exec -T db psql -U studio -d controlroomdb      -f - < "$SCRIPT_DIR/sql/views.sql"  > /dev/null
docker compose exec -T db psql -U studio -d controlroomdb_test -f - < "$SCRIPT_DIR/sql/views.sql"  > /dev/null
echo "  Schema and views applied"

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
echo "  App:  https://localhost:2112"
echo "  API:  https://localhost:5150"
echo "  Docs: https://localhost:5150/docs"
if $WITH_DEV; then
  echo ""
  echo "  SonarQube: http://localhost:9000"
fi
echo "============================================================"
