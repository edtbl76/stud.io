#!/bin/bash
# =============================================================================
# STUD.io ControlRoom — CO₂ per-page report
#
# Calls the Website Carbon API for each user-facing page and prints a table:
#   Page | Rating | CO₂ (g) | Greener than | Green hosting
#
# NOTE: This script requires the app to be publicly deployed.
#   The Website Carbon API fetches each page from their servers — it cannot
#   reach localhost or a private network. Until the app is public, use the
#   local CO₂ estimates built into the Lighthouse perf suite instead:
#     ./scripts/test-perf.sh   (see the co2_estimate annotation per page)
#
# Usage (once the app is public):
#   CARBON_BASE_URL=https://your-app.example.com ./scripts/carbon-report.sh
#   # or set carbon_base_url in test.config.yaml and run via test-perf.sh
#
# Requirements:
#   - The base URL must be publicly accessible (the API fetches the page itself)
#   - curl and python3 must be available
#   - Localhost URLs are rejected with a clear error message
#
# Rate limit: the Website Carbon API is free but rate-limited — this script
# processes pages sequentially with a 1-second pause to avoid 429 errors.
# =============================================================================
set -e

ROOT="$(git rev-parse --show-toplevel)"
source "$ROOT/scripts/cfg.sh"

CARBON_BASE_URL="${CARBON_BASE_URL:-$(cfg carbon_base_url 2>/dev/null || true)}"

if [ -z "$CARBON_BASE_URL" ]; then
    echo "[carbon] Skipping CO₂ report — carbon_base_url not set."
    echo "[carbon] To enable: set CARBON_BASE_URL=https://your-app.example.com"
    echo "[carbon]            or set carbon_base_url in test.config.yaml"
    exit 0
fi

# Reject localhost — the API requires a publicly reachable URL
case "$CARBON_BASE_URL" in
    *localhost*|*127.0.0.1*|*::1*)
        echo "[carbon] Skipping CO₂ report — base URL is localhost."
        echo "[carbon] The Website Carbon API requires a public URL."
        echo "[carbon] Run with: CARBON_BASE_URL=https://your-app.example.com ./scripts/carbon-report.sh"
        exit 0
        ;;
esac

PAGES=(
    "/"
    "/search"
    "/catalog/brands"
    "/catalog/models"
    "/session/effects"
    "/session/instruments"
    "/session/libraries"
    "/session/workstations"
    "/tools/workflow"
    "/tools/admin"
    "/tools/composition"
    "/tools/measurement"
    "/tools/reference"
    "/config/effect-types"
    "/config/entity-types"
    "/config/instrument-types"
    "/config/model-types"
    "/config/plugin-formats"
    "/config/tag-types"
    "/config/tool-types"
    "/admin/change-review"
    "/admin/users"
    "/admin/stats"
    "/admin/backup"
    "/admin/import-export"
)

API="https://api.websitecarbon.com/site"
FAILED=0

echo ""
echo "[carbon] CO₂ report against: $CARBON_BASE_URL"
echo "[carbon] Pages: ${#PAGES[@]}"
echo ""
printf "%-30s  %-6s  %-10s  %-18s  %s\n" "Page" "Rating" "CO₂ (g)" "Greener than %" "Green hosting"
printf "%-30s  %-6s  %-10s  %-18s  %s\n" "------------------------------" "------" "----------" "------------------" "-------------"

for PATH_PART in "${PAGES[@]}"; do
    FULL_URL="${CARBON_BASE_URL}${PATH_PART}"
    ENCODED_URL="$(python3 -c "import urllib.parse, sys; print(urllib.parse.quote(sys.argv[1], safe=''))" "$FULL_URL")"

    RESPONSE=$(curl -sf --max-time 30 "${API}?url=${ENCODED_URL}" 2>/dev/null || echo "ERROR")

    if [ "$RESPONSE" = "ERROR" ] || [ -z "$RESPONSE" ]; then
        printf "%-30s  %-6s  %-10s  %-18s  %s\n" "$PATH_PART" "err" "n/a" "n/a" "n/a"
        FAILED=1
        sleep 1
        continue
    fi

    python3 - "$PATH_PART" "$RESPONSE" <<'PYEOF'
import sys, json

path = sys.argv[1]
try:
    data = json.loads(sys.argv[2])
except json.JSONDecodeError:
    print(f"{'%-30s' % path}  {'err':<6}  {'parse error':<10}  {'n/a':<18}  n/a")
    sys.exit(0)

rating      = data.get("rating", "?")
co2         = data.get("statistics", {}).get("co2", {})
co2_g       = co2.get("grid", {}).get("grams", "?")
cleaner_pct = data.get("cleanerThan", "?")
green       = "yes" if data.get("green") else "no"

if isinstance(co2_g, float):
    co2_str = f"{co2_g:.4f}"
else:
    co2_str = str(co2_g)

if isinstance(cleaner_pct, (int, float)):
    cleaner_str = f"{round(cleaner_pct * 100)}%"
else:
    cleaner_str = str(cleaner_pct)

print(f"{'%-30s' % path}  {rating:<6}  {co2_str:<10}  {cleaner_str:<18}  {green}")
PYEOF

    sleep 1
done

echo ""
if [ "$FAILED" -eq 1 ]; then
    echo "[carbon] WARNING: One or more pages failed to fetch from the API."
fi
echo "[carbon] Data provided by https://www.websitecarbon.com"
echo "[carbon] API docs: https://api.websitecarbon.com"
