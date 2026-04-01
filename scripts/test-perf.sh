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
#   6. Playwright + Lighthouse: Core Web Vitals, accessibility, best-practices
#   7. CO₂ per-page report via Website Carbon API (skipped unless carbon_base_url is set)
#
# Usage:
#   ./scripts/test-perf.sh [flags]
#
# Flags:
#   -h, --help        Show this help message
#   --bundle          Run bundle analysis only (steps 1-3)
#   --benchmarks      Run pytest benchmarks only (steps 1-4)
#   --k6              Run k6 load tests only (steps 1-3, 5)
#   --lighthouse      Run Lighthouse audits only (steps 1-3, 6)
#   --no-bundle       Skip the production Next.js build (reuse existing .next-perf)
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

# ---------------------------------------------------------------------------
# Flags
# ---------------------------------------------------------------------------
RUN_BUNDLE=true
RUN_BENCHMARKS=true
RUN_K6=true
RUN_LIGHTHOUSE=true
SKIP_BUILD=false
ONLY_MODE=false

usage() {
    sed -n '/^# Usage:/,/^# ======/{ /^# ======/d; s/^# \{0,1\}//; p }' "$0"
    exit 0
}

for arg in "$@"; do
    case "$arg" in
        -h|--help)        usage ;;
        --bundle)         ONLY_MODE=true; RUN_BENCHMARKS=false; RUN_K6=false; RUN_LIGHTHOUSE=false ;;
        --benchmarks)     ONLY_MODE=true; RUN_BUNDLE=false; RUN_K6=false; RUN_LIGHTHOUSE=false ;;
        --k6)             ONLY_MODE=true; RUN_BUNDLE=false; RUN_BENCHMARKS=false; RUN_LIGHTHOUSE=false ;;
        --lighthouse)     ONLY_MODE=true; RUN_BUNDLE=false; RUN_BENCHMARKS=false; RUN_K6=false ;;
        --no-bundle)      SKIP_BUILD=true ;;
        *) echo "[perf] Unknown flag: $arg"; echo "Run with -h for help."; exit 1 ;;
    esac
done

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
WARNED=0
BENCHMARKS_RESULT=skip
K6_RESULT=skip
LIGHTHOUSE_RESULT=skip

cleanup() {
    echo ""
    echo "[perf] Tearing down..."
    [ -n "$FRONTEND_PID" ] && kill -- -"$FRONTEND_PID" 2>/dev/null || true
    docker rm -f "$PERF_CONTAINER" 2>/dev/null || true
    if [ "$SKIP_BUILD" = false ]; then
        rm -rf "$FRONTEND_DIR/.next-perf"
    fi
    echo "[perf] Done."
}
trap cleanup EXIT INT TERM

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
if [ "$SKIP_BUILD" = true ]; then
    echo "[perf] Skipping build (--no-bundle), reusing existing .next-perf."
    if [ ! -d "$FRONTEND_DIR/.next-perf" ]; then
        echo "[perf] ERROR: .next-perf not found. Run without --no-bundle first."
        exit 1
    fi
else
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
fi

# ---------------------------------------------------------------------------
# 3. Start Next.js production server
# ---------------------------------------------------------------------------
echo "[perf] Starting frontend on port $FRONTEND_PORT..."
if fuser "${FRONTEND_PORT}/tcp" > /dev/null 2>&1; then
    BUSY_PID="$(fuser "${FRONTEND_PORT}/tcp" 2>/dev/null || true)"
    echo ""
    echo "[perf] ERROR: port ${FRONTEND_PORT} is already in use (PID ${BUSY_PID})."
    echo "[perf] Cannot determine what owns the port — free it manually and re-run."
    exit 1
fi
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
if [ "$RUN_BENCHMARKS" = true ]; then
    echo "[perf] Running EXPLAIN plan assertions and benchmarks..."
    if (set -o pipefail; cd "$BACKEND_DIR" && python -m pytest \
            tests/test_query_plans.py \
            tests/test_benchmarks.py \
            -v \
            --benchmark-json=/tmp/perf-benchmarks.json \
            2>&1 | tee /tmp/perf-pytest.log | sed -u 's/^/[pytest] /'); then
        BENCHMARKS_RESULT=pass
    else
        BENCHMARKS_RESULT=fail
        FAILED=1
    fi
else
    echo "[perf] Skipping benchmarks."
fi

# ---------------------------------------------------------------------------
# 5. k6 load tests (skipped if k6 is not installed)
# ---------------------------------------------------------------------------
if [ "$RUN_K6" = true ]; then
    if ! command -v k6 > /dev/null 2>&1; then
        echo "[perf] WARNING: k6 not installed — skipping load tests."
        echo "[perf]          Install: https://k6.io/docs/get-started/installation/"
        K6_RESULT=skip
    else
        K6_RESULT=pass
        for SCRIPT in "$ROOT/tests/perf/k6/"*.js; do
            [ "$(basename "$SCRIPT")" = "thresholds.js" ] && continue
            NAME="$(basename "$SCRIPT" .js)"
            echo "[perf] Running k6: $NAME..."
            if ! (
                set -o pipefail
                BACKEND_URL="http://localhost:${BACKEND_PORT}" \
                    k6 run "$SCRIPT" \
                    2>&1 | tee "/tmp/perf-k6-${NAME}.log" | sed -u "s/^/[k6:${NAME}] /"
            ); then
                K6_RESULT=fail
                FAILED=1
            fi
        done
    fi
else
    echo "[perf] Skipping k6 load tests."
fi

# ---------------------------------------------------------------------------
# 6. Playwright + Lighthouse: Core Web Vitals, accessibility, best-practices
# ---------------------------------------------------------------------------
if [ "$RUN_LIGHTHOUSE" = true ]; then
    echo "[perf] Running Lighthouse audits (full logs: /tmp/perf-playwright.log)..."
    rm -f /tmp/perf-lcp-warnings
    if (set -o pipefail; cd "$FRONTEND_DIR" && BASE_URL="http://localhost:${FRONTEND_PORT}" \
            npx playwright test \
                --config playwright.perf.config.ts \
            2>&1 | tee /tmp/perf-playwright.log | sed -u 's/^/[lighthouse] /'); then
        if [ -s /tmp/perf-lcp-warnings ]; then
            LIGHTHOUSE_RESULT=warn
            WARNED=1
        else
            LIGHTHOUSE_RESULT=pass
        fi
    else
        LIGHTHOUSE_RESULT=fail
        FAILED=1
    fi
else
    echo "[perf] Skipping Lighthouse audits."
fi

# ---------------------------------------------------------------------------
# 7. CO₂ per-page report (skipped unless carbon_base_url is configured)
# ---------------------------------------------------------------------------
CARBON_BASE_URL="$(cfg carbon_base_url 2>/dev/null || true)"
if [ -n "$CARBON_BASE_URL" ]; then
    echo "[perf] Running CO₂ report against $CARBON_BASE_URL..."
    "$ROOT/scripts/carbon-report.sh" 2>&1 | sed -u 's/^/[carbon] /' || true
else
    echo "[perf] Skipping CO₂ report (carbon_base_url not set in test.config.yaml)."
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
result() {
    case "$1" in
        pass) echo "PASS" ;;
        warn) echo "WARN" ;;
        fail) echo "FAIL" ;;
        skip) echo "skip" ;;
    esac
}

echo ""
echo "[perf] ┌─────────────────────┐"
echo "[perf] │ Performance Summary │"
echo "[perf] ├──────────────┬──────┤"
printf "[perf] │ %-12s │ %s │\n" "Benchmarks" "$(result "$BENCHMARKS_RESULT")"
printf "[perf] │ %-12s │ %s │\n" "k6"         "$(result "$K6_RESULT")"
printf "[perf] │ %-12s │ %s │\n" "Lighthouse" "$(result "$LIGHTHOUSE_RESULT")"
echo "[perf] └──────────────┴──────┘"

echo "[perf] Benchmark results:  /tmp/perf-benchmarks.json"
echo "[perf] Bundle reports:     $FRONTEND_DIR/.next-perf/analyze/"
echo "[perf] Lighthouse reports: $FRONTEND_DIR/perf-reports/lighthouse/"

if [ "$FAILED" -ne 0 ]; then
    echo "[perf] One or more performance checks FAILED."
    exit 1
elif [ "$WARNED" -ne 0 ]; then
    echo "[perf] Performance checks passed with warnings — check Lighthouse HTML report for LCP details."
else
    echo "[perf] All performance checks passed."
fi
