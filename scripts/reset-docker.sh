#!/bin/bash
# =============================================================================
# STUD.io ControlRoom — Docker reset
#
# Stops and removes all project containers. Volumes are preserved.
# Run ./build.sh afterward to bring everything back up.
#
# Usage:
#   ./scripts/reset-docker.sh
# =============================================================================
set -e

ROOT="$(git rev-parse --show-toplevel)"

echo "[reset] Stopping main stack..."
docker compose -f "$ROOT/docker-compose.yml" down --remove-orphans 2>/dev/null || true

echo "[reset] Stopping dev stack (SonarQube)..."
docker compose -f "$ROOT/docker-compose.dev.yml" -p dev down --remove-orphans 2>/dev/null || true

echo "[reset] Removing leftover perf/test containers..."
docker rm -f controlroom_backend_test_perf 2>/dev/null || true
docker rm -f controlroom_backend_test      2>/dev/null || true

echo "[reset] Done. Run ./build.sh to restart."
