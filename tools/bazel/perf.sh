#!/bin/bash
# Bazel sh_test wrapper — performance suite (benchmarks + k6 + Lighthouse)
set -e
ROOT="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/../.." && pwd)"
cd "$ROOT"
exec roadie test perf
