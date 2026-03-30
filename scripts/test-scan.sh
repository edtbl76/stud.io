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
#   -h, --help      Show this help message
#   --sonar         Run SonarQube scan only
#   --trivy         Run Trivy image scan only
#   --secrets       Run detect-secrets audit only
#   --headers       Run HTTP security header assertions only
#
# Prerequisites:
#   - Production stack running: docker compose up -d
#   - Dev stack running (for --sonar): ./scripts/dev.sh up
# =============================================================================
set -e

RUN_SONAR=true
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
        -h|--help)    usage ;;
        --sonar)      ONLY_MODE=true; RUN_TRIVY=false;  RUN_SECRETS=false; RUN_HEADERS=false ;;
        --trivy)      ONLY_MODE=true; RUN_SONAR=false;  RUN_SECRETS=false; RUN_HEADERS=false ;;
        --secrets)    ONLY_MODE=true; RUN_SONAR=false;  RUN_TRIVY=false;   RUN_HEADERS=false ;;
        --headers)    ONLY_MODE=true; RUN_SONAR=false;  RUN_TRIVY=false;   RUN_SECRETS=false ;;
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

# ---------------------------------------------------------------------------
# 1. SonarQube
# ---------------------------------------------------------------------------
if [ "$RUN_SONAR" = true ]; then
    echo "[scan] Running SonarQube..."
    bash "$ROOT/scripts/sonar-scan.sh" 2>&1 | sed -u 's/^/[sonar] /' || FAILED=1
else
    echo "[scan] Skipping SonarQube."
fi

# ---------------------------------------------------------------------------
# 2. Trivy container image scan
# ---------------------------------------------------------------------------
if [ "$RUN_TRIVY" = true ]; then
    echo "[scan] Running Trivy image scan..."
    bash "$ROOT/scripts/run-trivy.sh" 2>&1 | sed -u 's/^/[trivy] /' || FAILED=1
else
    echo "[scan] Skipping Trivy."
fi

# ---------------------------------------------------------------------------
# 3. detect-secrets audit
# ---------------------------------------------------------------------------
if [ "$RUN_SECRETS" = true ]; then
    echo "[scan] Running detect-secrets audit..."
    (
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
    ) || FAILED=1
else
    echo "[scan] Skipping detect-secrets."
fi

# ---------------------------------------------------------------------------
# 4. HTTP security headers
# ---------------------------------------------------------------------------
if [ "$RUN_HEADERS" = true ]; then
    FRONTEND_URL="${SCAN_BASE_URL:-https://localhost:2112}"
    echo "[scan] Asserting security headers against $FRONTEND_URL..."
    (
        set -o pipefail
        SCAN_BASE_URL="$FRONTEND_URL" \
            python -m pytest "$ROOT/tests/security/test_security_headers.py" -v \
            2>&1 | sed -u 's/^/[headers] /'
    ) || FAILED=1
else
    echo "[scan] Skipping security headers."
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
if [ "$FAILED" -eq 0 ]; then
    echo "[scan] All security checks passed."
else
    echo "[scan] One or more security checks FAILED."
    exit 1
fi
