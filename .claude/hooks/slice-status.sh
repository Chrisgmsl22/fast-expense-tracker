#!/usr/bin/env bash
#
# SessionStart hook: roadmap slice-status view.
#
# Read-only. Delegates to the TypeScript engine, which derives the current
# slice / available slices / in-flight slices from docs/roadmap/slices.json
# + git, and prints a SessionStart envelope. Never mutates anything; never
# fails the session (the engine swallows errors into an informational
# envelope, and this wrapper stays silent if node is unavailable).

set -uo pipefail

# Repo targets Node >=24. If node is missing, stay silent rather than erroring.
command -v node >/dev/null 2>&1 || exit 0

node "${CLAUDE_PROJECT_DIR}/scripts/roadmap-status.ts" --hook 2>/dev/null || exit 0
