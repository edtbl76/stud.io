#!/bin/bash
# =============================================================================
# STUD.io ControlRoom — Security scan runner
#
# Runs the full security suite:
#   1. SonarQube — SAST, code quality, coverage gate
#   2. Trivy     — container image scan (OS + app deps), HIGH + CRITICAL CVEs
#   3. Secrets   — detect-secrets audit against baseline
#   4. Headers   — HTTP security header assertions against the running stack
#
# Usage:
#   ./scripts/test-scan.sh [flags]
#
# Flags:
#   -h, --help        Show this help message
#   --sonar           Run SonarQube scan only (no gate check)
#   --sonar-gate      Run SonarQube scan and verify the quality gate passes
#   --trivy           Run Trivy image scan only
#   --secrets         Run detect-secrets audit only
#   --headers         Run HTTP security header assertions only
#
# Prerequisites:
#   - Production stack running: docker compose up -d
#   - Dev stack running (for --sonar/--sonar-gate): ./scripts/dev.sh up
#   - .sonar-token present (for --sonar-gate)
# =============================================================================
set -e

RUN_SONAR=true
RUN_GATE=true
RUN_TRIVY=true
RUN_SECRETS=true
RUN_HEADERS=true
ONLY_MODE=false

usage() {
    sed -n '/^# Usage:/,/^# ======/{ /^# ======/d; s/^# \{0,1\}//; p }' "$0"
    exit 0
}

for arg in "$@"; do
    case "$arg" in
        -h|--help) usage ;;
        --sonar|--sonar-gate|--trivy|--secrets|--headers)
            if [ "$ONLY_MODE" = true ]; then
                echo "[scan] Error: mode flags are mutually exclusive — only one of --sonar, --sonar-gate, --trivy, --secrets, --headers may be specified."
                exit 1
            fi
            ONLY_MODE=true
            RUN_SONAR=false; RUN_GATE=false; RUN_TRIVY=false; RUN_SECRETS=false; RUN_HEADERS=false
            case "$arg" in
                --sonar)      RUN_SONAR=true ;;
                --sonar-gate) RUN_SONAR=true; RUN_GATE=true ;;
                --trivy)      RUN_TRIVY=true ;;
                --secrets)    RUN_SECRETS=true ;;
                --headers)    RUN_HEADERS=true ;;
            esac
            ;;
        *) echo "[scan] Unknown flag: $arg"; echo "Run with -h for help."; exit 1 ;;
    esac
done

# Locate Python
for DIR in \
    "$HOME/anaconda3/bin" \
    "$HOME/miniconda3/bin" \
    "$HOME/opt/anaconda3/bin" \
    "$HOME/opt/miniconda3/bin"; do
    [ -f "$DIR/python" ] && export PATH="$DIR:$PATH" && break
done

ROOT="$(git rev-parse --show-toplevel)"

FAILED=0
SONAR_RESULT=skip
GATE_RESULT=skip
TRIVY_RESULT=skip
SECRETS_RESULT=skip
HEADERS_RESULT=skip

# ---------------------------------------------------------------------------
# 1. SonarQube
# ---------------------------------------------------------------------------
if [ "$RUN_SONAR" = true ]; then
    # Generate frontend coverage before invoking the scanner.
    # jest --coverage OOM-crashes the SonarJS Node.js bridge when run immediately
    # before the Docker scanner. Running it here lets pytest (inside sonar-scan.sh)
    # provide a natural gap for the OS to reclaim jest's memory.
    echo "[scan] Generating frontend coverage (jest)..."
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
    for DIR in \
        "$HOME/.nvm/versions/node/$(ls "$HOME/.nvm/versions/node" 2>/dev/null | tail -1)/bin" \
        "/usr/local/bin" \
        "/usr/bin"; do
        [ -f "$DIR/node" ] && export PATH="$DIR:$PATH" && break
    done
    cd "$ROOT/app/controlroom_frontend"
    node_modules/.bin/jest --coverage --coverageReporters=lcov --passWithNoTests 2>&1 | tail -3
    cd "$ROOT"

    echo "[scan] Running SonarQube..."
    if (set -o pipefail; bash "$ROOT/scripts/sonar-scan.sh" 2>&1 | sed -u 's/^/[sonar] /'); then
        SONAR_RESULT=pass
    else
        SONAR_RESULT=fail
        FAILED=1
    fi
else
    echo "[scan] Skipping SonarQube."
fi

# ---------------------------------------------------------------------------
# 1b. SonarQube quality gate (only when --sonar-gate is set)
# ---------------------------------------------------------------------------
if [ "$RUN_GATE" = true ]; then
        SONAR_URL="http://localhost:1969"
        if [ -z "$SONAR_TOKEN" ]; then
            echo "[scan] ERROR: SONAR_TOKEN is not set. Export it before running --sonar-gate."
            exit 1
        fi
        echo -n "[scan] Waiting for CE task"
        for i in $(seq 1 100); do
            pending=$(curl -sf --connect-timeout 5 --max-time 10 \
                -H "Authorization: Bearer $SONAR_TOKEN" \
                "$SONAR_URL/api/ce/component?component=controlroom" \
                | python3 -c "
import sys,json
d=json.load(sys.stdin)
q=d.get('queue') or []
c=d.get('current') or {}
active=any(t.get('status') in ('IN_PROGRESS','PENDING') for t in q)
if c.get('status') in ('IN_PROGRESS','PENDING'): active=True
print('yes' if active else 'no')
" 2>/dev/null || echo "yes")
            [ "$pending" = "no" ] && break
            echo -n "."
            sleep 3
        done
        echo " done"
        gate=$(curl -sf --connect-timeout 5 --max-time 10 \
            -H "Authorization: Bearer $SONAR_TOKEN" \
            "$SONAR_URL/api/qualitygates/project_status?projectKey=controlroom" \
            | python3 -c "import sys,json; print(json.load(sys.stdin)['projectStatus']['status'])" 2>/dev/null \
            || echo "ERROR")
        echo ""
        if [ "$gate" = "OK" ]; then
            echo "[scan] Quality gate: OK"
            GATE_RESULT=pass
        else
            echo "[scan] Quality gate: $gate"
            curl -sf --connect-timeout 5 --max-time 10 \
                -H "Authorization: Bearer $SONAR_TOKEN" \
                "$SONAR_URL/api/qualitygates/project_status?projectKey=controlroom" \
                | python3 -c "
import sys, json
d = json.load(sys.stdin)
for c in d['projectStatus'].get('conditions', []):
    if c['status'] == 'ERROR':
        print(f\"[scan]   FAIL: {c['metricKey']} = {c.get('actualValue','?')} (threshold: {c.get('errorThreshold','?')})\")
" 2>/dev/null || true
            GATE_RESULT=fail
            FAILED=1
        fi
fi

# ---------------------------------------------------------------------------
# 2. Trivy container image scan
# ---------------------------------------------------------------------------
if [ "$RUN_TRIVY" = true ]; then
    echo "[scan] Running Trivy image scan..."
    if (set -o pipefail; bash "$ROOT/scripts/run-trivy.sh" 2>&1 | sed -u 's/^/[trivy] /'); then
        TRIVY_RESULT=pass
    else
        TRIVY_RESULT=fail
        FAILED=1
    fi
else
    echo "[scan] Skipping Trivy."
fi

# ---------------------------------------------------------------------------
# 3. detect-secrets audit
# ---------------------------------------------------------------------------
if [ "$RUN_SECRETS" = true ]; then
    echo "[scan] Running detect-secrets audit..."
    if (
        set -o pipefail
        cd "$ROOT"
        detect-secrets scan \
            --exclude-files 'node_modules/.*' \
            --exclude-files '\.git/.*' \
            --exclude-files '.*\.lock$' \
            --exclude-files 'package-lock\.json' \
            --exclude-files '.*\.next/.*' \
            --exclude-files '.*__pycache__.*' \
            --exclude-files '\.secrets\.baseline' \
            --exclude-files 'structurizr/workspace\.json' \
            > /tmp/secrets_current.json

        python3 - <<'PYEOF'
import json, sys

current = json.load(open('/tmp/secrets_current.json'))
baseline = json.load(open('.secrets.baseline'))

added = []
for fname, findings in current.get('results', {}).items():
    old = baseline.get('results', {}).get(fname, [])
    for r in findings:
        if r not in old:
            added.append(f"{fname}:{r['line_number']} [{r['type']}]")

if added:
    print("[secrets] New secrets detected (not in baseline):")
    for s in added:
        print(f"[secrets]   {s}")
    print("[secrets] Run: detect-secrets scan --baseline .secrets.baseline")
    sys.exit(1)

total = sum(len(v) for v in current.get('results', {}).values())
print(f"[secrets] No new secrets detected ({total} findings, all baselined).")
PYEOF
    ); then
        SECRETS_RESULT=pass
    else
        SECRETS_RESULT=fail
        FAILED=1
    fi
else
    echo "[scan] Skipping detect-secrets."
fi

# ---------------------------------------------------------------------------
# 4. HTTP security headers
# ---------------------------------------------------------------------------
if [ "$RUN_HEADERS" = true ]; then
    FRONTEND_URL="${SCAN_BASE_URL:-https://localhost:2112}"
    echo "[scan] Asserting security headers against $FRONTEND_URL..."
    if (
        set -o pipefail
        SCAN_BASE_URL="$FRONTEND_URL" \
            python -m pytest "$ROOT/tests/security/test_security_headers.py" -v \
            2>&1 | sed -u 's/^/[headers] /'
    ); then
        HEADERS_RESULT=pass
    else
        HEADERS_RESULT=fail
        FAILED=1
    fi
else
    echo "[scan] Skipping security headers."
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
label() { printf "  %-12s" "$1"; }
result() {
    case "$1" in
        pass) echo "PASS" ;;
        fail) echo "FAIL" ;;
        skip) echo "skip" ;;
    esac
}

echo ""
echo "[scan] ┌──────────────────────┐"
echo "[scan] │  Code Scan Summary   │"
echo "[scan] ├───────────────┬──────┤"
printf "[scan] │ %-13s │ %s │\n" "SonarQube" "$(result "$SONAR_RESULT")"
printf "[scan] │ %-13s │ %s │\n" "Sonar Gate" "$(result "$GATE_RESULT")"
printf "[scan] │ %-13s │ %s │\n" "Trivy"     "$(result "$TRIVY_RESULT")"
printf "[scan] │ %-13s │ %s │\n" "Secrets"   "$(result "$SECRETS_RESULT")"
printf "[scan] │ %-13s │ %s │\n" "Headers"   "$(result "$HEADERS_RESULT")"
echo "[scan] └───────────────┴──────┘"

if [ "$FAILED" -eq 0 ]; then
    echo "[scan] All security checks passed."
else
    echo "[scan] One or more security checks FAILED."
    exit 1
fi
