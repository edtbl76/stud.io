#!/bin/bash
# =============================================================================
# STUD.io — Studio Script
# Starts infrastructure, generates seeds, and reseeds the database
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "============================================================"
echo "  STUD.io"
echo "============================================================"

# ---------------------------------------------------------------------------
# 1. Start Docker containers if not running
# ---------------------------------------------------------------------------
echo ""
echo "[1/4] Checking Docker containers..."
cd "$SCRIPT_DIR"

if ! docker compose ps | grep -q "running"; then
    echo "  Starting containers..."
    docker compose up -d
    echo "  Waiting for PostgreSQL to be ready..."
    until docker compose exec db pg_isready -U studio -q; do
        sleep 1
    done
    echo "  PostgreSQL is ready"
else
    echo "  Containers already running"
fi

# ---------------------------------------------------------------------------
# 2. Generate seed files from CSVs
# ---------------------------------------------------------------------------
echo ""
echo "[2/4] Running converters..."
cd "$SCRIPT_DIR/util"
python3 convert_effects.py
python3 convert_instruments.py
python3 convert_libraries.py

echo ""
echo "[3/4] Generating seed files..."
python3 generate_seeds.py

# ---------------------------------------------------------------------------
# 3. Reseed the database
# ---------------------------------------------------------------------------
echo ""
echo "[4/4] Reseeding database..."
python3 reseed.py

echo ""
echo "============================================================"
echo "  Ready. Connect to studio@localhost:5432/studio"
echo "============================================================"
