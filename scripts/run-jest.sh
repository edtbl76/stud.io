#!/bin/bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

for DIR in \
    "$HOME/.nvm/versions/node/$(ls $HOME/.nvm/versions/node 2>/dev/null | tail -1)/bin" \
    "/usr/local/bin" \
    "/usr/bin"; do
    [ -f "$DIR/node" ] && export PATH="$DIR:$PATH" && break
done

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT/app/controlroom_frontend"
node_modules/.bin/jest --passWithNoTests
