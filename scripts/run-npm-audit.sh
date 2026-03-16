#!/bin/bash
# Locate Node — tries nvm then common system locations
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
# --audit-level=critical: two high-severity Next.js CVEs (GHSA-9g9p-9gw9-jx7f,
# GHSA-h25m-26qc-wcjf) have no fix in 14.x; fix requires Next.js 16 (breaking).
# Neither applies to this app: no remotePatterns configured, no insecure RSC.
# Revisit when upgrading to Next.js 16.
npm audit --audit-level=critical
