#!/bin/bash
# Usage: source scripts/cfg.sh && cfg pytest_workers
# Reads a key from test.config.yaml using Python.
ROOT="$(git rev-parse --show-toplevel)"
cfg() {
    python3 -c "import yaml; print(yaml.safe_load(open('$ROOT/test.config.yaml'))['$1'])"
}
