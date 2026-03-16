#!/bin/bash
# Locate Python — tries conda then common system locations
for DIR in \
    "$HOME/anaconda3/bin" \
    "$HOME/miniconda3/bin" \
    "$HOME/opt/anaconda3/bin" \
    "$HOME/opt/miniconda3/bin"; do
    [ -f "$DIR/python" ] && export PATH="$DIR:$PATH" && break
done

ROOT="$(git rev-parse --show-toplevel)"
python -m bandit -r "$ROOT/app/controlroom_backend" \
    --exclude "$ROOT/app/controlroom_backend/tests" \
    -c "$ROOT/.bandit" \
    -ll -q
