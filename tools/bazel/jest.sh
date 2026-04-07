#!/bin/bash
# Bazel sh_test wrapper — Jest unit tests
set -e
ROOT="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/../.." && pwd)"
cd "$ROOT"
exec roadie test unit jest
