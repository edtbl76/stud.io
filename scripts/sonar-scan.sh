#!/bin/bash
# Run SonarQube scanner against the project.
# Requires the dev stack to be running: ./scripts/dev.sh up
set -e

SONAR_HOST="http://localhost:9000"
SONAR_TOKEN="${SONAR_TOKEN:-admin}"
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "Running SonarQube scanner..."
docker run --rm \
  --network dev_default \
  -e SONAR_HOST_URL="$SONAR_HOST" \
  -e SONAR_TOKEN="$SONAR_TOKEN" \
  -v "$PROJECT_ROOT:/usr/src" \
  sonarsource/sonar-scanner-cli \
  -Dsonar.host.url="$SONAR_HOST" \
  -Dsonar.token="$SONAR_TOKEN"

echo ""
echo "Results: $SONAR_HOST/dashboard?id=controlroom"
