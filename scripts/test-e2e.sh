#!/bin/bash
# =============================================================================
# STUD.io ControlRoom — E2E test runner
# Runs Playwright tests from app/controlroom_frontend/
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

echo "[e2e] Running Playwright tests..."
cd "$ROOT/app/controlroom_frontend"
npx playwright test

echo "[e2e] All E2E tests passed."
