#!/bin/bash
# Bazel sh_test wrapper — Playwright E2E (requires full Docker stack)
# Resolve workspace root via symlink so this works from any Bazel CWD.
set -e
ROOT="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/../.." && pwd)"
cd "$ROOT"
exec ./scripts/test-e2e.sh
