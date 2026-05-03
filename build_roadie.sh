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
sudo install -m 0755 "$BINARY" /usr/local/bin/roadie
rm "$BINARY"

echo "[build_roadie] Installing bash completion..."
COMPLETION_DIR="$HOME/.local/share/bash-completion/completions"
mkdir -p "$COMPLETION_DIR"
/usr/local/bin/roadie completion bash > "$COMPLETION_DIR/roadie"
/usr/local/bin/roadie completion bash | sudo tee /etc/bash_completion.d/roadie > /dev/null

echo "[build_roadie] Reloading shell..."
source "$HOME/.bashrc" || true

cd "$SCRIPT_DIR"
echo "[build_roadie] Done."
