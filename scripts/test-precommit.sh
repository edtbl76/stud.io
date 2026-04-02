#!/bin/bash
# =============================================================================
# STUD.io ControlRoom — Pre-commit hook runner
#
# Runs pre-commit hooks against all files without performing a commit.
# Default (no flags) runs all hooks in the same order as the commit hook.
#
# Usage:
#   ./scripts/test-precommit.sh [flags]
#
# Flags:
#   -h, --help           Show this help message
#   --ruff               Run ruff (Python lint) only
#   --unit-tests         Run unit tests (tsc + jest + pytest) only
#   --bandit             Run bandit (Python SAST) only
#   --pip-audit          Run pip-audit (Python CVEs) only
#   --npm-audit          Run npm-audit (Node CVEs) only
#   --detect-secrets     Run detect-secrets only
# =============================================================================
set -e

RUN_RUFF=true
RUN_UNIT=true
RUN_BANDIT=true
RUN_PIP=true
RUN_NPM=true
RUN_SECRETS=true

usage() {
    sed -n '/^# Usage:/,/^# ======/{ /^# ======/d; s/^# \{0,1\}//; p }' "$0"
    exit 0
}

for arg in "$@"; do
    case "$arg" in
        -h|--help)          usage ;;
        --ruff)             RUN_UNIT=false; RUN_BANDIT=false; RUN_PIP=false; RUN_NPM=false; RUN_SECRETS=false ;;
        --unit-tests)       RUN_RUFF=false; RUN_BANDIT=false; RUN_PIP=false; RUN_NPM=false; RUN_SECRETS=false ;;
        --bandit)           RUN_RUFF=false; RUN_UNIT=false;   RUN_PIP=false; RUN_NPM=false; RUN_SECRETS=false ;;
        --pip-audit)        RUN_RUFF=false; RUN_UNIT=false;   RUN_BANDIT=false; RUN_NPM=false; RUN_SECRETS=false ;;
        --npm-audit)        RUN_RUFF=false; RUN_UNIT=false;   RUN_BANDIT=false; RUN_PIP=false; RUN_SECRETS=false ;;
        --detect-secrets)   RUN_RUFF=false; RUN_UNIT=false;   RUN_BANDIT=false; RUN_PIP=false; RUN_NPM=false ;;
        *) echo "[precommit] Unknown flag: $arg"; echo "Run with -h for help."; exit 1 ;;
    esac
done

ROOT="$(git rev-parse --show-toplevel)"
FAILED=0

if ! command -v pre-commit &>/dev/null; then
    echo "[precommit] ERROR: pre-commit not found. Run: pip install pre-commit"
    exit 1
fi

run_hook() {
    local hook_id="$1"
    echo "[precommit] Running $hook_id..."
    (set -o pipefail; pre-commit run "$hook_id" --all-files 2>&1 | sed -u "s/^/[$hook_id] /") || FAILED=1
}

[ "$RUN_RUFF" = true ]    && run_hook ruff
[ "$RUN_UNIT" = true ]    && run_hook unit-tests
[ "$RUN_BANDIT" = true ]  && run_hook bandit
[ "$RUN_PIP" = true ]     && run_hook pip-audit
[ "$RUN_NPM" = true ]     && run_hook npm-audit
[ "$RUN_SECRETS" = true ] && run_hook detect-secrets

echo ""
if [ "$FAILED" -eq 0 ]; then
    echo "[precommit] All hooks passed."
else
    echo "[precommit] One or more hooks FAILED."
    exit 1
fi
