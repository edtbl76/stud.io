#!/bin/bash
# Bazel sh_test wrapper — Trivy container image scan
set -e
ROOT="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/../.." && pwd)"
cd "$ROOT"
exec roadie test scan trivy
