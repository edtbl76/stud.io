#!/bin/bash
# =============================================================================
# Build and install the roadie binary.
#
# Usage:
#   ./build_roadie.sh
# =============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROADIE_SRC="$SCRIPT_DIR/roadie"
BINARY="/tmp/roadie"

echo "[build_roadie] Running tests..."
cd "$ROADIE_SRC"
go test ./...

echo "[build_roadie] Building binary..."
go build -o "$BINARY" ./cmd/roadie

echo "[build_roadie] Installing to /usr/local/bin/roadie..."
sudo cp "$BINARY" /usr/local/bin/roadie
rm "$BINARY"

cd "$SCRIPT_DIR"
echo "[build_roadie] Done."
