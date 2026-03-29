#!/bin/bash
# =============================================================================
# STUD.io ControlRoom — E2E test runner (sharded)
#
# Builds the backend image once, then spins up N backend containers + N
# databases, runs Playwright --shard=K/N for each shard in parallel, and
# tears everything down.
#
# Prerequisites:
#   - Production stack running:  docker compose up -d
#   - Dev stack running:         ./scripts/dev.sh up
#
# The dev stack's controlroom_backend_test is stopped during the run to free
# port 5151, then restored in cleanup.
#
# Ports:
#   backend shard K: backend_base_port + K  (e.g. 5151, 5152, 5153, 5154)
#   frontend shard K: frontend_base_port + K (e.g. 3001, 3002, 3003, 3004)
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
FRONTEND_DIR="$ROOT/app/controlroom_frontend"
source "$ROOT/scripts/cfg.sh"

SHARDS="$(cfg playwright_shards)"
COMPOSE_FILE="$ROOT/$(cfg backend_compose_file)"
COMPOSE_PROJECT="$(cfg backend_compose_project)"
BACKEND_SERVICE="$(cfg backend_service)"
BACKEND_INTERNAL_PORT="$(cfg backend_internal_port)"
BACKEND_BASE_PORT="$(cfg backend_base_port)"
FRONTEND_BASE_PORT="$(cfg frontend_base_port)"

FRONTEND_PIDS=()

cleanup() {
    echo ""
    echo "[e2e] Tearing down..."
    for PID in "${FRONTEND_PIDS[@]}"; do
        kill "$PID" 2>/dev/null || true
    done
    for i in $(seq 0 $((SHARDS - 1))); do
        docker rm -f "${BACKEND_SERVICE}_${i}" 2>/dev/null || true
    done
    # Clean up per-shard Next.js build directories.
    for i in $(seq 0 $((SHARDS - 1))); do
        rm -rf "$FRONTEND_DIR/.next-e2e-${i}"
    done
    # Restore the dev stack's backend service so dev.sh up works after tests.
    echo "[e2e] Restoring dev backend..."
    docker compose -f "$COMPOSE_FILE" -p "$COMPOSE_PROJECT" up -d "$BACKEND_SERVICE" 2>/dev/null || true
    echo "[e2e] Done."
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Build backend image once, then stop the dev stack's backend to free port
# ---------------------------------------------------------------------------
echo "[e2e] Building backend image..."
docker compose -f "$COMPOSE_FILE" -p "$COMPOSE_PROJECT" build "$BACKEND_SERVICE"

echo "[e2e] Stopping dev backend (freeing port $BACKEND_BASE_PORT)..."
docker compose -f "$COMPOSE_FILE" -p "$COMPOSE_PROJECT" stop "$BACKEND_SERVICE"

# ---------------------------------------------------------------------------
# Provision N databases (full clone of controlroomdb for each shard)
# ---------------------------------------------------------------------------
echo "[e2e] Provisioning $SHARDS test databases..."
for i in $(seq 0 $((SHARDS - 1))); do
    DB="controlroomdb_test_${i}"
    bash "$ROOT/scripts/reset-test-db.sh" "$DB"
done

# ---------------------------------------------------------------------------
# Start N backend containers
# ---------------------------------------------------------------------------
echo "[e2e] Starting $SHARDS backend containers..."
for i in $(seq 0 $((SHARDS - 1))); do
    PORT=$((BACKEND_BASE_PORT + i))
    DB="controlroomdb_test_${i}"
    CONTAINER="${BACKEND_SERVICE}_${i}"

    docker rm -f "$CONTAINER" 2>/dev/null || true
    docker compose -f "$COMPOSE_FILE" -p "$COMPOSE_PROJECT" \
        run -d --name "$CONTAINER" \
        -p "${PORT}:${BACKEND_INTERNAL_PORT}" \
        -e "DB_NAME=$DB" \
        "$BACKEND_SERVICE"
done

# Wait for all backends to be healthy
for i in $(seq 0 $((SHARDS - 1))); do
    PORT=$((BACKEND_BASE_PORT + i))
    echo "[e2e] Waiting for backend shard $i on port $PORT..."
    for attempt in $(seq 1 30); do
        if curl -sf "http://localhost:${PORT}/health" > /dev/null 2>&1; then
            echo "[e2e] Backend shard $i ready."
            break
        fi
        if [ "$attempt" -eq 30 ]; then
            echo "[e2e] ERROR: Backend shard $i did not start."
            exit 1
        fi
        sleep 2
    done
done

# ---------------------------------------------------------------------------
# Start N frontend processes
# ---------------------------------------------------------------------------
echo "[e2e] Starting $SHARDS frontend processes..."
for i in $(seq 0 $((SHARDS - 1))); do
    FRONTEND_PORT=$((FRONTEND_BASE_PORT + i))

    PID=$(ss -tlnp "sport = :$FRONTEND_PORT" 2>/dev/null | grep -oP 'pid=\K[0-9]+' | head -1 || true)
    [ -n "$PID" ] && kill "$PID" 2>/dev/null || true

    BACKEND_PORT=$((BACKEND_BASE_PORT + i))
    pushd "$FRONTEND_DIR" > /dev/null
    NEXT_DIST_DIR=".next-e2e-${i}" \
    BACKEND_URL="http://localhost:${BACKEND_PORT}" \
        npx next dev -p "$FRONTEND_PORT" -H 127.0.0.1 \
        > "/tmp/e2e-frontend-${i}.log" 2>&1 &  # logged only — Next.js dev output is too noisy for stdout
    FRONTEND_PIDS+=($!)
    popd > /dev/null
done

# Wait for all frontends to be ready
for i in $(seq 0 $((SHARDS - 1))); do
    FRONTEND_PORT=$((FRONTEND_BASE_PORT + i))
    echo "[e2e] Waiting for frontend shard $i on port $FRONTEND_PORT..."
    for attempt in $(seq 1 30); do
        if curl -sf "http://localhost:${FRONTEND_PORT}" > /dev/null 2>&1; then
            echo "[e2e] Frontend shard $i ready."
            break
        fi
        if [ "$attempt" -eq 30 ]; then
            echo "[e2e] ERROR: Frontend shard $i did not start."
            cat "/tmp/e2e-frontend-${i}.log"
            exit 1
        fi
        sleep 2
    done
done

# ---------------------------------------------------------------------------
# Run Playwright shards in parallel — output streamed live with shard label
# ---------------------------------------------------------------------------
echo "[e2e] Running $SHARDS Playwright shards in parallel (full logs: /tmp/e2e-shard-{0..N}.log)..."
SHARD_PIDS=()

for i in $(seq 0 $((SHARDS - 1))); do
    SHARD_NUM=$((i + 1))
    FRONTEND_PORT=$((FRONTEND_BASE_PORT + i))

    (
        set -o pipefail
        cd "$FRONTEND_DIR"
        BASE_URL="http://localhost:${FRONTEND_PORT}" \
            npx playwright test \
                --config playwright.test.config.ts \
                --shard="${SHARD_NUM}/${SHARDS}" \
            2>&1 | tee "/tmp/e2e-shard-${i}.log" | sed -u "s/^/[shard ${SHARD_NUM}\/${SHARDS}] /"
    ) &
    SHARD_PIDS+=($!)
done

# Wait for all shards and collect exit codes
FAILED=0
for i in "${!SHARD_PIDS[@]}"; do
    PID="${SHARD_PIDS[$i]}"
    if wait "$PID"; then
        echo "[e2e] Shard $((i + 1))/${SHARDS} passed."
    else
        echo "[e2e] Shard $((i + 1))/${SHARDS} FAILED. Full log: /tmp/e2e-shard-${i}.log"
        FAILED=1
    fi
done

[ "$FAILED" -eq 0 ] || exit 1
echo "[e2e] All E2E shards passed."
