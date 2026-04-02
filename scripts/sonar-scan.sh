#!/bin/bash
# Run SonarQube scanner against the project.
# Requires the dev stack to be running: ./build.sh --dev  or  ./scripts/dev.sh up
set -e

SONAR_HOST="http://localhost:1969"
PROJECT_KEY="controlroom"
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SONAR_LOGIN="${SONAR_LOGIN:-admin}"
SONAR_PASSWORD="${SONAR_PASSWORD:-My@mpGoesTo11}"

# Generate coverage report before scanning
echo "Generating coverage report..."
# Run from project root so --cov path is relative, producing a relative <source> in coverage.xml
# that the Docker SonarQube scanner can resolve under /usr/src.
python -m pytest "$PROJECT_ROOT/app/controlroom_backend/tests/" -q --tb=short \
    --cov=app/controlroom_backend \
    --cov-config="$PROJECT_ROOT/app/controlroom_backend/.coveragerc" \
    --cov-report=xml:"$PROJECT_ROOT/app/controlroom_backend/coverage.xml" 2>&1 | tail -5

# Frontend coverage must be pre-generated before this script is called.
# jest --coverage causes the SonarJS Node.js bridge to OOM-crash when run
# immediately before the Docker scanner. test-scan.sh generates lcov.info
# first, then pytest (above) provides a natural gap for memory reclamation.
LCOV="$PROJECT_ROOT/app/controlroom_frontend/coverage/lcov.info"
if [ ! -f "$LCOV" ]; then
  echo "ERROR: Frontend coverage not found at $LCOV"
  echo "Run ./scripts/test-scan.sh --sonar-gate (or test-unit.sh first)."
  exit 1
fi

# Fix lcov paths: Jest emits paths relative to the frontend dir (e.g. "SF:app/layout.tsx"),
# but SonarQube resolves them from the project root, so prefix with the frontend subdirectory.
if ! grep -q '^SF:app/controlroom_frontend/' "$LCOV"; then
  sed -i 's|^SF:|SF:app/controlroom_frontend/|' "$LCOV"
fi

echo "Running SonarQube scanner..."
docker run --rm \
  --network dev_default \
  -e SONAR_HOST_URL="http://sonarqube:9000" \
  -v "$PROJECT_ROOT:/usr/src" \
  sonarsource/sonar-scanner-cli \
  -Dsonar.host.url="http://sonarqube:9000" \
  -Dsonar.login="$SONAR_LOGIN" \
  -Dsonar.password="$SONAR_PASSWORD" \
  -Dsonar.projectKey="$PROJECT_KEY"

echo ""
echo "Results: $SONAR_HOST/dashboard?id=$PROJECT_KEY"
