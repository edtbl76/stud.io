#!/bin/bash
# =============================================================================
# STUD.io — App
# Starts infrastructure and runs the backend test suite
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "============================================================"
echo "  STUD.io — App"
echo "============================================================"

# ---------------------------------------------------------------------------
# 1. Start Docker containers if not running
# ---------------------------------------------------------------------------
echo ""
echo "[1/2] Checking Docker containers..."
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
# 2. Run test suite
# ---------------------------------------------------------------------------
echo ""
echo "[2/2] Running tests..."
cd "$SCRIPT_DIR/app/controlroom_backend"
python -m pytest tests/ -v

echo ""
echo "============================================================"
echo "  Done."
echo "============================================================"
