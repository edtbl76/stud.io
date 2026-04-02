#!/bin/bash
# Bazel sh_test wrapper — Trivy container image scan
# Resolve workspace root via symlink so this works from any Bazel CWD.
set -e
ROOT="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/../.." && pwd)"
cd "$ROOT"
exec ./scripts/run-trivy.sh
