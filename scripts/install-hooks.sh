#!/bin/bash
# Install git hooks via the pre-commit framework.
# Run this once on each new machine after cloning.
set -e

if ! command -v pre-commit &>/dev/null; then
    echo "pre-commit not found. Install it with: pip install pre-commit"
    exit 1
fi

pre-commit install
echo "Hooks installed."
