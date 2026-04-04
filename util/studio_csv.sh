#!/bin/bash
# =============================================================================
# STUD.io — CSV Pipeline
# Starts infrastructure, runs converters, generates seeds, and reseeds studio db
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

echo "============================================================"
echo "  STUD.io — CSV Pipeline"
echo "============================================================"

# ---------------------------------------------------------------------------
# 1. Start Docker containers if not running
# ---------------------------------------------------------------------------
echo ""
echo "[1/4] Checking Docker containers..."
cd "$ROOT_DIR"

if ! docker compose ps | grep -q "running"; then
    echo "  Starting containers..."
    docker compose up -d
    echo "  Waiting for PostgreSQL to be ready..."
    until docker compose exec studio_db pg_isready -U studio -q; do
        sleep 1
    done
    echo "  PostgreSQL is ready"
else
    echo "  Containers already running"
fi

# ---------------------------------------------------------------------------
# 2. Run converters
# ---------------------------------------------------------------------------
echo ""
echo "[2/4] Running converters..."
cd "$SCRIPT_DIR"
python3 convert_effects.py
python3 convert_instruments.py
python3 convert_libraries.py

# ---------------------------------------------------------------------------
# 3. Generate seed files
# ---------------------------------------------------------------------------
echo ""
echo "[3/4] Generating seed files..."
python3 generate_seeds.py

# ---------------------------------------------------------------------------
# 4. Reseed the database
# ---------------------------------------------------------------------------
echo ""
echo "[4/4] Reseeding database..."
python3 reseed.py

echo ""
echo "============================================================"
echo "  Ready. Connect to studio@localhost:5432/studio"
echo "============================================================"
