#!/bin/bash
# Run SonarQube scanner against the project.
# Requires the dev stack to be running: ./app.sh --dev  or  ./scripts/dev.sh up
set -e

SONAR_HOST="http://localhost:9000"
PROJECT_KEY="controlroom"
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TOKEN_FILE="$PROJECT_ROOT/.sonar-token"

if [ ! -f "$TOKEN_FILE" ]; then
  echo "ERROR: No analysis token found. Run ./scripts/dev.sh up first."
  exit 1
fi

TOKEN=$(cat "$TOKEN_FILE")

echo "Running SonarQube scanner..."
docker run --rm \
  --network dev_default \
  -e SONAR_HOST_URL="http://sonarqube:9000" \
  -e SONAR_TOKEN="$TOKEN" \
  -v "$PROJECT_ROOT:/usr/src" \
  sonarsource/sonar-scanner-cli \
  -Dsonar.host.url="http://sonarqube:9000" \
  -Dsonar.token="$TOKEN" \
  -Dsonar.projectKey="$PROJECT_KEY"

echo ""
echo "Results: $SONAR_HOST/dashboard?id=$PROJECT_KEY"
