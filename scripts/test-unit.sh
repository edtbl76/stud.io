#!/bin/bash
# =============================================================================
# STUD.io ControlRoom — Unit test runner
# Runs tsc, jest, and pytest in sequence. Exits on first failure.
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

for DIR in \
    "$HOME/anaconda3/bin" \
    "$HOME/miniconda3/bin" \
    "$HOME/opt/anaconda3/bin" \
    "$HOME/opt/miniconda3/bin"; do
    [ -f "$DIR/python" ] && export PATH="$DIR:$PATH" && break
done

ROOT="$(git rev-parse --show-toplevel)"

echo "[unit] tsc..."
cd "$ROOT/app/controlroom_frontend"
./node_modules/.bin/tsc --noEmit

echo "[unit] jest..."
cd "$ROOT/app/controlroom_frontend"
npm test -- --no-coverage

echo "[unit] pytest..."
cd "$ROOT/app/controlroom_backend"
python -m pytest tests/ -v

echo "[unit] All unit checks passed."
