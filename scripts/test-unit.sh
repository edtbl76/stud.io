#!/bin/bash
# =============================================================================
# STUD.io ControlRoom — Unit test runner
# Runs tsc, jest, and pytest. pytest runs in parallel via pytest-xdist.
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
source "$ROOT/scripts/cfg.sh"

WORKERS="$(cfg pytest_workers)"

echo "[unit] tsc..."
cd "$ROOT/app/controlroom_frontend"
./node_modules/.bin/tsc --noEmit

echo "[unit] jest..."
cd "$ROOT/app/controlroom_frontend"
npm test -- --no-coverage

echo "[unit] Provisioning $WORKERS test databases..."
bash "$ROOT/scripts/provision-test-dbs.sh" "$WORKERS"

echo "[unit] pytest ($WORKERS workers)..."
cd "$ROOT/app/controlroom_backend"
python -m pytest tests/ -v -n "$WORKERS" --dist=load

echo "[unit] All unit checks passed."
