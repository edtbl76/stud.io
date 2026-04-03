#!/bin/bash
# Trivy container image scan — HIGH + CRITICAL severity.
# Covers OS packages, Python packages, and npm packages installed in each image.
# Requires the production stack to be running: docker compose up -d
set -e

BACKEND_CONTAINER="controlroom_backend"
FRONTEND_CONTAINER="controlroom_frontend"

BACKEND_IMAGE=$(docker inspect "$BACKEND_CONTAINER" --format '{{.Image}}' 2>/dev/null || true)
FRONTEND_IMAGE=$(docker inspect "$FRONTEND_CONTAINER" --format '{{.Image}}' 2>/dev/null || true)

if [ -z "$BACKEND_IMAGE" ] || [ -z "$FRONTEND_IMAGE" ]; then
    echo "[trivy] ERROR: Stack not running. Run: docker compose up -d"
    exit 1
fi

FAILED=0

ROOT="$(git rev-parse --show-toplevel)"

scan() {
    local label="$1"
    local image="$2"
    echo "[trivy] Scanning $label image..."
    docker run --rm \
        -v /var/run/docker.sock:/var/run/docker.sock \
        -v trivy-cache:/root/.cache/trivy \
        -v "$ROOT/.trivyignore:/src/.trivyignore:ro" \
        ghcr.io/aquasecurity/trivy:latest image \
        --severity HIGH,CRITICAL \
        --exit-code 1 \
        --no-progress \
        --ignorefile /src/.trivyignore \
        "$image" || FAILED=1
}

scan "backend"  "$BACKEND_IMAGE"
scan "frontend" "$FRONTEND_IMAGE"

if [ "$FAILED" -eq 0 ]; then
    echo "[trivy] All image scans passed."
else
    echo "[trivy] Image scan FAILED."
    exit 1
fi
