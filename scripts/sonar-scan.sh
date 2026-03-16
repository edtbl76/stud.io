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

# Generate coverage report before scanning
echo "Generating coverage report..."
for DIR in \
    "$HOME/anaconda3/bin" \
    "$HOME/miniconda3/bin" \
    "$HOME/opt/anaconda3/bin" \
    "$HOME/opt/miniconda3/bin"; do
    [ -f "$DIR/python" ] && export PATH="$DIR:$PATH" && break
done
python -m pytest "$PROJECT_ROOT/app/controlroom_backend/tests/" -q --tb=short \
    --cov="$PROJECT_ROOT/app/controlroom_backend" \
    --cov-config="$PROJECT_ROOT/app/controlroom_backend/.coveragerc" \
    --cov-report=xml:"$PROJECT_ROOT/app/controlroom_backend/coverage.xml" 2>&1 | tail -5

# Generate frontend coverage
echo "Generating frontend coverage..."
cd "$PROJECT_ROOT/app/controlroom_frontend"
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
for DIR in \
    "$HOME/.nvm/versions/node/$(ls $HOME/.nvm/versions/node 2>/dev/null | tail -1)/bin" \
    "/usr/local/bin" \
    "/usr/bin"; do
    [ -f "$DIR/node" ] && export PATH="$DIR:$PATH" && break
done
node_modules/.bin/jest --coverage --coverageReporters=lcov --passWithNoTests 2>&1 | tail -3
cd "$PROJECT_ROOT"

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
