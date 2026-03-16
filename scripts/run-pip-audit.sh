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
# CVE-2024-23342: Minerva timing attack against ECDSA keys in the `ecdsa` package.
# Ignored: transitive dep of python-jose; we use HS256 (HMAC) for JWTs, not EC keys.
python -m pip_audit -r "$ROOT/app/controlroom_backend/requirements.txt" \
    --ignore-vuln CVE-2024-23342
