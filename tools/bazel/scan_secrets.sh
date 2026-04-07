#!/bin/bash
# Bazel sh_test wrapper — detect-secrets audit
set -e
ROOT="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/../.." && pwd)"
cd "$ROOT"
exec roadie test scan secrets
