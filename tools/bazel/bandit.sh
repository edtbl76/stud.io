#!/bin/bash
# Bazel sh_test wrapper — bandit SAST
set -e
ROOT="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/../.." && pwd)"
cd "$ROOT"
exec roadie test unit bandit
