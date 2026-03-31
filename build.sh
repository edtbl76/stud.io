#!/bin/bash
# =============================================================================
# STUD.io ControlRoom — Build
# Starts all containers, applies schema, and runs tests.
#
# Usage:
#   ./build.sh              # Start stack + unit tests + E2E tests
#   ./build.sh --skip-tests # Start stack only
#   ./build.sh --skip-e2e   # Start stack + unit tests only
#   ./build.sh --dev        # Include SonarQube: scan + quality gate check before E2E
#   ./build.sh --release    # Full release gate: --dev + Trivy + secrets + header scans
#
# Flags can be combined, e.g.: ./build.sh --dev --skip-e2e
# With --dev or --release, E2E is blocked if the SonarQube quality gate fails.
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Parse flags
WITH_DEV=false
WITH_RELEASE=false
SKIP_TESTS=false
SKIP_E2E=false

for arg in "$@"; do
  case "$arg" in
    --dev)        WITH_DEV=true ;;
    --release)    WITH_RELEASE=true; WITH_DEV=true ;;
    --skip-tests) SKIP_TESTS=true ;;
    --skip-e2e)   SKIP_E2E=true ;;
    *) echo "Unknown flag: $arg"; exit 1 ;;
  esac
done

echo "============================================================"
echo "  STUD.io ControlRoom"
if $WITH_RELEASE; then echo "  (release gate)";
elif $WITH_DEV;   then echo "  (+ dev stack)"; fi
echo "============================================================"

# ---------------------------------------------------------------------------
# 1. Start Docker containers
# ---------------------------------------------------------------------------
echo ""
echo "[1/4] Starting Docker containers..."
cd "$SCRIPT_DIR"
docker compose up -d --build --force-recreate

if $WITH_DEV; then
  bash "$SCRIPT_DIR/scripts/dev.sh" up
fi

# ---------------------------------------------------------------------------
# 2. Wait for services
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
# 4. Unit tests
# ---------------------------------------------------------------------------
echo ""
echo "[4/5] Running unit tests..."

if $SKIP_TESTS; then
  echo "  Skipping all tests (--skip-tests)."
else
  bash "$SCRIPT_DIR/scripts/test-unit.sh"

  # -------------------------------------------------------------------------
  # 5. Security scans (dev/release only)
  # -------------------------------------------------------------------------
  echo ""
  echo "[5/5] Security scans..."

  if ! $WITH_DEV; then
    echo "  Skipping (--dev or --release not set)."
  else
    if $WITH_RELEASE; then
      bash "$SCRIPT_DIR/scripts/test-scan.sh"
    else
      bash "$SCRIPT_DIR/scripts/test-scan.sh" --sonar
    fi

    TOKEN_FILE="$SCRIPT_DIR/.sonar-token"
    if [ ! -f "$TOKEN_FILE" ]; then
      echo "  WARNING: .sonar-token not found — cannot verify quality gate."
    else
      TOKEN=$(cat "$TOKEN_FILE")
      SONAR_URL="http://localhost:1969"

      echo -n "  Waiting for SonarQube analysis "
      for i in $(seq 1 30); do
        gate=$(curl -sf -H "Authorization: Bearer $TOKEN" \
          "$SONAR_URL/api/qualitygates/project_status?projectKey=controlroom" \
          | python3 -c "import sys,json; print(json.load(sys.stdin)['projectStatus']['status'])" 2>/dev/null || echo "IN_PROGRESS")
        [ "$gate" != "IN_PROGRESS" ] && break
        echo -n "."
        sleep 2
      done
      echo " done"

      if [ "$gate" != "OK" ]; then
        echo "  ERROR: SonarQube quality gate failed ($gate). Fix violations before running E2E."
        exit 1
      fi
      echo "  Quality gate: OK"
    fi
  fi

  if $SKIP_E2E; then
    echo "  Skipping E2E tests (--skip-e2e)."
  else
    bash "$SCRIPT_DIR/scripts/test-e2e.sh"
  fi

  if $WITH_RELEASE; then
    echo ""
    echo "[6/6] Performance tests..."
    bash "$SCRIPT_DIR/scripts/test-perf.sh"
  fi
fi

echo ""
echo "============================================================"
echo "  All systems go."
echo ""
echo "  App:  https://localhost:2112"
echo "  API:  https://localhost:5150"
echo "  Docs: https://localhost:5150/docs"
if $WITH_DEV; then
  echo ""
  echo "  SonarQube:    http://localhost:1969"
  echo "  Structurizr:  http://localhost:1967"
fi
if $WITH_RELEASE; then
  echo ""
  echo "  Release gate passed: Sonar + Trivy + secrets + headers + perf"
fi
echo "============================================================"
