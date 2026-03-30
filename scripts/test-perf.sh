#!/bin/bash
# =============================================================================
# STUD.io ControlRoom — Performance test runner
#
# Runs the full perf suite against controlroomdb_test (read-only, no clone):
#   1. Start one backend container
#   2. Production Next.js build (+ @next/bundle-analyzer report)
#   3. Start Next.js production server
#   4. pytest: EXPLAIN plan assertions + benchmarks
#   5. k6: API load tests (skipped with a warning if k6 is not installed)
#   6. Playwright + Lighthouse: Core Web Vitals for all pages
#
# Prerequisites:
#   - Production stack running:  docker compose up -d
#   - Dev stack running:         ./scripts/dev.sh up
#   - controlroomdb_test exists: ./scripts/reset-test-db.sh
#
# Outputs:
#   /tmp/perf-benchmarks.json          pytest-benchmark results
#   /tmp/perf-k6-<script>.log          k6 output per script
#   <frontend>/perf-reports/lighthouse Lighthouse HTML reports
#   <frontend>/.next-perf/analyze/     bundle analyzer reports
# =============================================================================
set -e

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

for DIR in \
    "$HOME/.nvm/versions/node/$(ls "$HOME/.nvm/versions/node" 2>/dev/null | tail -1)/bin" \
    "/usr/local/bin" \
    "/usr/bin"; do
    [ -f "$DIR/node" ] && export PATH="$DIR:$PATH" && break
done

ROOT="$(git rev-parse --show-toplevel)"
BACKEND_DIR="$ROOT/app/controlroom_backend"
FRONTEND_DIR="$ROOT/app/controlroom_frontend"
source "$ROOT/scripts/cfg.sh"

BACKEND_PORT="$(cfg perf_backend_port)"
FRONTEND_PORT="$(cfg perf_frontend_port)"
COMPOSE_FILE="$ROOT/$(cfg backend_compose_file)"
COMPOSE_PROJECT="$(cfg backend_compose_project)"
BACKEND_SERVICE="$(cfg backend_service)"
BACKEND_INTERNAL_PORT="$(cfg backend_internal_port)"
DB_NAME="$(cfg test_db_source)"

PERF_CONTAINER="${BACKEND_SERVICE}_perf"
FRONTEND_PID=""
FAILED=0

cleanup() {
    echo ""
    echo "[perf] Tearing down..."
    [ -n "$FRONTEND_PID" ] && kill "$FRONTEND_PID" 2>/dev/null || true
    docker rm -f "$PERF_CONTAINER" 2>/dev/null || true
    rm -rf "$FRONTEND_DIR/.next-perf"
    echo "[perf] Done."
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# 1. Start backend container (reuses existing image — no rebuild)
# ---------------------------------------------------------------------------
echo "[perf] Starting backend on port $BACKEND_PORT (DB: $DB_NAME)..."
docker rm -f "$PERF_CONTAINER" 2>/dev/null || true
docker compose -f "$COMPOSE_FILE" -p "$COMPOSE_PROJECT" \
    run -d --name "$PERF_CONTAINER" \
    -p "${BACKEND_PORT}:${BACKEND_INTERNAL_PORT}" \
    -e "DB_NAME=$DB_NAME" \
    "$BACKEND_SERVICE"

for attempt in $(seq 1 30); do
    if curl -sf "http://localhost:${BACKEND_PORT}/health" > /dev/null 2>&1; then
        echo "[perf] Backend ready."
        break
    fi
    if [ "$attempt" -eq 30 ]; then
        echo "[perf] ERROR: Backend did not start on port $BACKEND_PORT."
        exit 1
    fi
    sleep 2
done

# ---------------------------------------------------------------------------
# 2. Production Next.js build (+ bundle analysis report)
# ---------------------------------------------------------------------------
echo "[perf] Building frontend (production + bundle analysis)..."
echo "[perf] Bundle reports will be written to $FRONTEND_DIR/.next-perf/analyze/"
pushd "$FRONTEND_DIR" > /dev/null
(
    set -o pipefail
    NEXT_DIST_DIR=".next-perf" \
    ANALYZE=true \
    BACKEND_URL="http://localhost:${BACKEND_PORT}" \
        npx next build 2>&1 | tee /tmp/perf-nextbuild.log | sed -u 's/^/[next-build] /'
)
popd > /dev/null

# ---------------------------------------------------------------------------
# 3. Start Next.js production server
# ---------------------------------------------------------------------------
echo "[perf] Starting frontend on port $FRONTEND_PORT..."
pushd "$FRONTEND_DIR" > /dev/null
NEXT_DIST_DIR=".next-perf" \
BACKEND_URL="http://localhost:${BACKEND_PORT}" \
    npx next start -p "$FRONTEND_PORT" -H 127.0.0.1 \
    > /tmp/perf-frontend.log 2>&1 &
FRONTEND_PID=$!
popd > /dev/null

for attempt in $(seq 1 30); do
    if curl -sf "http://localhost:${FRONTEND_PORT}" > /dev/null 2>&1; then
        echo "[perf] Frontend ready."
        break
    fi
    if [ "$attempt" -eq 30 ]; then
        echo "[perf] ERROR: Frontend did not start on port $FRONTEND_PORT."
        cat /tmp/perf-frontend.log
        exit 1
    fi
    sleep 2
done

# ---------------------------------------------------------------------------
# 4. pytest: EXPLAIN plan assertions + benchmarks
# ---------------------------------------------------------------------------
echo "[perf] Running EXPLAIN plan assertions and benchmarks..."
(
    set -o pipefail
    cd "$BACKEND_DIR"
    python -m pytest \
        tests/test_query_plans.py \
        tests/test_benchmarks.py \
        -v \
        --benchmark-json=/tmp/perf-benchmarks.json \
        2>&1 | tee /tmp/perf-pytest.log | sed -u 's/^/[pytest] /'
) || FAILED=1

# ---------------------------------------------------------------------------
# 5. k6 load tests (skipped if k6 is not installed)
# ---------------------------------------------------------------------------
if ! command -v k6 > /dev/null 2>&1; then
    echo "[perf] WARNING: k6 not installed — skipping load tests."
    echo "[perf]          Install: https://k6.io/docs/get-started/installation/"
else
    for SCRIPT in "$ROOT/tests/perf/k6/"*.js; do
        [ "$(basename "$SCRIPT")" = "thresholds.js" ] && continue
        NAME="$(basename "$SCRIPT" .js)"
        echo "[perf] Running k6: $NAME..."
        (
            set -o pipefail
            BACKEND_URL="http://localhost:${BACKEND_PORT}" \
                k6 run "$SCRIPT" \
                2>&1 | tee "/tmp/perf-k6-${NAME}.log" | sed -u "s/^/[k6:${NAME}] /"
        ) || FAILED=1
    done
fi

# ---------------------------------------------------------------------------
# 6. Playwright + Lighthouse: Core Web Vitals
# ---------------------------------------------------------------------------
echo "[perf] Running Lighthouse audits (full logs: /tmp/perf-playwright.log)..."
(
    set -o pipefail
    cd "$FRONTEND_DIR"
    BASE_URL="http://localhost:${FRONTEND_PORT}" \
        npx playwright test \
            --config playwright.perf.config.ts \
        2>&1 | tee /tmp/perf-playwright.log | sed -u 's/^/[lighthouse] /'
) || FAILED=1

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
if [ "$FAILED" -eq 0 ]; then
    echo "[perf] All performance checks passed."
else
    echo "[perf] One or more performance checks FAILED."
fi

echo "[perf] Benchmark results:  /tmp/perf-benchmarks.json"
echo "[perf] Bundle reports:     $FRONTEND_DIR/.next-perf/analyze/"
echo "[perf] Lighthouse reports: $FRONTEND_DIR/perf-reports/lighthouse/"

[ "$FAILED" -eq 0 ] || exit 1
