#!/usr/bin/env bash
#
# SessionStart hook: bug-register status view.
#
# Read-only. Delegates to the TypeScript engine, which reads
# docs/roadmap/bugs.json + the current branch and prints a SessionStart
# envelope ([bugs] open / in-progress / fixed / merged). Never mutates
# anything; never fails the session (the engine swallows errors into an
# informational envelope, and this wrapper stays silent if node is missing).

set -uo pipefail

# Repo targets Node >=24. If node is missing, stay silent rather than erroring.
command -v node >/dev/null 2>&1 || exit 0

node "${CLAUDE_PROJECT_DIR}/scripts/bugs-status.ts" --hook 2>/dev/null || exit 0
