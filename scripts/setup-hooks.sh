#!/usr/bin/env bash
# Points git at the repo's committed hooks directory. Idempotent.
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

git config core.hooksPath .githooks
echo "setup-hooks: core.hooksPath -> .githooks"
