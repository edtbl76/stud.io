#!/bin/bash
# Manage the dev tooling stack (SonarQube).
# Runs as a separate Docker project named "dev", isolated from the studio stack.
#
# Usage:
#   ./scripts/dev.sh up      # Start dev stack, provision password + project
#   ./scripts/dev.sh down    # Stop dev stack (preserves data)
#   ./scripts/dev.sh reset   # Wipe all data and start fresh
#   ./scripts/dev.sh status  # Show running containers
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$PROJECT_ROOT/docker-compose.dev.yml"

SONAR_HOST="http://localhost:9000"
SONAR_USER="admin"
SONAR_PASS="My@mpGoesTo11"
DEFAULT_PASS="admin"
PROJECT_KEY="controlroom"
PROJECT_NAME="STUD.io ControlRoom"

case "${1:-up}" in
  up)
    echo "Starting dev stack (SonarQube)..."
    docker compose -f "$COMPOSE_FILE" -p dev up -d

    echo ""
    echo -n "Waiting for SonarQube"
    until curl -sf "$SONAR_HOST/api/system/status" | grep -q '"status":"UP"'; do
      printf '.'
      sleep 3
    done
    echo " ready"

    # Change default password if not yet done
    VALID=$(curl -s -u "$SONAR_USER:$DEFAULT_PASS" "$SONAR_HOST/api/authentication/validate" || true)
    if echo "$VALID" | grep -q '"valid":true'; then
      echo -n "Setting password..."
      RESULT=$(curl -s -w "%{http_code}" -o /dev/null \
        -u "$SONAR_USER:$DEFAULT_PASS" -X POST "$SONAR_HOST/api/users/change_password" \
        -d "login=$SONAR_USER&previousPassword=$DEFAULT_PASS&password=$SONAR_PASS" || true)
      if [ "$RESULT" = "204" ] || [ "$RESULT" = "200" ]; then
        echo " done"
      else
        echo " failed (HTTP $RESULT) — may already be set"
      fi
    fi

    # Create project if it doesn't exist
    SEARCH=$(curl -s -u "$SONAR_USER:$SONAR_PASS" "$SONAR_HOST/api/projects/search?projects=$PROJECT_KEY" || true)
    if ! echo "$SEARCH" | grep -q "\"key\":\"$PROJECT_KEY\""; then
      echo -n "Creating project '$PROJECT_KEY'..."
      RESULT=$(curl -s -w "%{http_code}" -o /dev/null \
        -u "$SONAR_USER:$SONAR_PASS" -X POST "$SONAR_HOST/api/projects/create" \
        -d "name=$PROJECT_NAME&project=$PROJECT_KEY" || true)
      if [ "$RESULT" = "200" ]; then
        echo " done"
      else
        echo " failed (HTTP $RESULT)"
      fi
    fi

    # Generate persistent analysis token if not already stored
    TOKEN_FILE="$PROJECT_ROOT/.sonar-token"
    if [ ! -f "$TOKEN_FILE" ]; then
      echo -n "Generating analysis token..."
      TOKEN_RESP=$(curl -s -u "$SONAR_USER:$SONAR_PASS" -X POST "$SONAR_HOST/api/user_tokens/generate" \
        -d "name=STUD.io+ControlRoom&type=PROJECT_ANALYSIS_TOKEN&projectKey=$PROJECT_KEY" || true)
      TOKEN=$(echo "$TOKEN_RESP" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
      if [ -n "$TOKEN" ]; then
        echo "$TOKEN" > "$TOKEN_FILE"
        echo " done"
      else
        echo " failed: $TOKEN_RESP"
      fi
    fi

    echo ""
    echo "SonarQube: $SONAR_HOST  (admin / My@mpGoesTo11)"
    echo ""
    echo "To scan: ./scripts/sonar-scan.sh"
    ;;
  down)
    echo "Stopping dev stack..."
    docker compose -f "$COMPOSE_FILE" -p dev down
    ;;
  reset)
    echo "Resetting dev stack (wiping all data)..."
    docker compose -f "$COMPOSE_FILE" -p dev down -v
    rm -f "$PROJECT_ROOT/.sonar-token"
    bash "$0" up
    ;;
  status)
    docker compose -f "$COMPOSE_FILE" -p dev ps
    ;;
  *)
    echo "Usage: $0 {up|down|reset|status}"
    exit 1
    ;;
esac
