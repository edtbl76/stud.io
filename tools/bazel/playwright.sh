#!/bin/bash
# Bazel sh_test wrapper — Playwright E2E (requires full Docker stack)
set -e
ROOT="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/../.." && pwd)"
cd "$ROOT"
exec roadie test e2e
