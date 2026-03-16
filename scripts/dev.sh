#!/bin/bash
# Manage the dev tooling stack (SonarQube).
# Runs as a separate Docker project named "dev", isolated from the studio stack.
#
# Usage:
#   ./scripts/dev.sh up      # Start dev stack
#   ./scripts/dev.sh down    # Stop dev stack
#   ./scripts/dev.sh status  # Show running containers
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$PROJECT_ROOT/docker-compose.dev.yml"

case "${1:-up}" in
  up)
    echo "Starting dev stack (SonarQube)..."
    docker compose -f "$COMPOSE_FILE" -p dev up -d
    echo ""
    echo "Waiting for SonarQube to be ready..."
    until curl -sf http://localhost:9000/api/system/status | grep -q '"status":"UP"'; do
      printf '.'
      sleep 3
    done
    echo ""
    echo "SonarQube: http://localhost:9000  (default login: admin / admin)"
    echo ""
    echo "To scan the project:"
    echo "  ./scripts/sonar-scan.sh"
    ;;
  down)
    echo "Stopping dev stack..."
    docker compose -f "$COMPOSE_FILE" -p dev down
    ;;
  status)
    docker compose -f "$COMPOSE_FILE" -p dev ps
    ;;
  *)
    echo "Usage: $0 {up|down|status}"
    exit 1
    ;;
esac
