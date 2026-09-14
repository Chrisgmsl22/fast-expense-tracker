#!/usr/bin/env bash
#
# Prints the SessionStart hook lines as plain text, for a client without a hook
# runner. Runs the same scripts .claude/settings.json wires, in the same order.

set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export CLAUDE_PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$ROOT}"

for hook in branch-status slice-status bugs-status chores-status worktree-status; do
    out="$(cd "$ROOT" && bash "$ROOT/.claude/hooks/${hook}.sh" 2>/dev/null)" || true
    [ -n "$out" ] || continue
    line="$(printf '%s\n' "$out" | jq -r '.hookSpecificOutput.additionalContext // empty' 2>/dev/null)" \
        || line="$out"
    [ -n "$line" ] && printf '%s\n' "$line"
done

exit 0
