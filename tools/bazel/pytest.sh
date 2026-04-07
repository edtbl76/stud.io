#!/bin/bash
# Bazel sh_test wrapper — pytest (requires live PostgreSQL)
set -e
ROOT="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/../.." && pwd)"
cd "$ROOT"
exec roadie test unit pytest
