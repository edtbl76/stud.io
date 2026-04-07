#!/bin/bash
# Bazel sh_test wrapper — SonarQube scan + quality gate
set -e
ROOT="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/../.." && pwd)"
cd "$ROOT"
exec roadie test scan sonar --gate
