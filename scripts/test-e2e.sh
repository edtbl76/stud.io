#!/bin/bash
# =============================================================================
# STUD.io ControlRoom — E2E test runner
#
# Runs Playwright tests against an on-demand test stack backed by
# controlroomdb_test so that tests never touch the production database.
#
# Prerequisites:
#   - Production stack running:  docker compose up -d
#   - Dev stack running:         ./scripts/dev.sh up
#     (dev stack includes controlroom_backend_test on port 5151)
#
# The test database is reset to a mirror of production before each run.
#
# Ports used (must be free):
#   5151 — test backend (controlroom_backend_test container, via dev stack)
#   3001 — test Next.js frontend (host)
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

TEST_BACKEND_PORT=5151
TEST_FRONTEND_PORT=3001
FRONTEND_PID=""

cleanup() {
    echo ""
    echo "[e2e] Stopping test frontend..."
    [ -n "$FRONTEND_PID" ] && kill "$FRONTEND_PID" 2>/dev/null || true
    wait "$FRONTEND_PID" 2>/dev/null || true
    echo "[e2e] Done."
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Rebuild and restart test backend so code changes are picked up
# ---------------------------------------------------------------------------
echo "[e2e] Rebuilding test backend..."
docker rm -f controlroom_backend_test 2>/dev/null || true
docker compose -f "$ROOT/docker-compose.dev.yml" -p dev build controlroom_backend_test
docker compose -f "$ROOT/docker-compose.dev.yml" -p dev up -d controlroom_backend_test

# Wait for the test backend to be healthy after restart
echo "[e2e] Waiting for test backend..."
for i in $(seq 1 30); do
    if curl -sf "http://localhost:$TEST_BACKEND_PORT/health" > /dev/null 2>&1; then
        echo "[e2e] Test backend ready."
        break
    fi
    if [ "$i" -eq 30 ]; then
        echo "[e2e] ERROR: Test backend did not start in time."
        exit 1
    fi
    sleep 2
done

# ---------------------------------------------------------------------------
# Ensure test frontend port is free
# ---------------------------------------------------------------------------
PID=$(ss -tlnp "sport = :$TEST_FRONTEND_PORT" 2>/dev/null | grep -oP 'pid=\K[0-9]+' | head -1 || true)
if [ -n "$PID" ]; then
    echo "[e2e] Port $TEST_FRONTEND_PORT in use (PID $PID) — killing..."
    kill "$PID" 2>/dev/null || true
    sleep 1
fi

# ---------------------------------------------------------------------------
# Reset test database to a clean mirror of production
# ---------------------------------------------------------------------------
echo "[e2e] Resetting test database..."
bash "$ROOT/scripts/reset-test-db.sh"

# ---------------------------------------------------------------------------
# Start test frontend on port 3001, proxying to the test backend
# ---------------------------------------------------------------------------
echo "[e2e] Starting test frontend (port $TEST_FRONTEND_PORT)..."
pushd "$FRONTEND_DIR" > /dev/null
# Use a separate build directory (.next-e2e) so the Docker container's .next
# (built with container-internal paths) never conflicts with this host process.
NEXT_DIST_DIR=.next-e2e \
BACKEND_URL="http://localhost:$TEST_BACKEND_PORT" \
    npx next dev \
        -p "$TEST_FRONTEND_PORT" \
        -H 127.0.0.1 \
        > /tmp/e2e-frontend.log 2>&1 &
FRONTEND_PID=$!
popd > /dev/null

echo "[e2e] Waiting for test frontend..."
for i in $(seq 1 30); do
    if curl -sf "http://localhost:$TEST_FRONTEND_PORT" > /dev/null 2>&1; then
        echo "[e2e] Frontend ready."
        break
    fi
    if [ "$i" -eq 30 ]; then
        echo "[e2e] ERROR: Frontend did not start in time."
        echo "--- frontend log ---"
        cat /tmp/e2e-frontend.log
        exit 1
    fi
    sleep 2
done

# ---------------------------------------------------------------------------
# Run Playwright against the test stack
# ---------------------------------------------------------------------------
echo "[e2e] Running Playwright tests..."
cd "$FRONTEND_DIR"
npx playwright test --config playwright.test.config.ts

echo "[e2e] All E2E tests passed."
