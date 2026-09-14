#!/usr/bin/env bash
#
# PostToolUse(Agent) hook: one read-only line summarising what a subagent left
# in the working tree, so the main thread checks the diff before trusting the
# report. Never fails the tool call.

set -uo pipefail

cat >/dev/null # the payload is not needed; the summary reads git state only

cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

paths="$(git status --porcelain 2>/dev/null | grep -c .)"
unstaged="$(git diff --shortstat 2>/dev/null | sed -E 's/^[[:space:]]+//')"
staged="$(git diff --cached --shortstat 2>/dev/null | sed -E 's/^[[:space:]]+//')"

ctx="[subagent-diff] ${paths} changed paths (git status --porcelain), ${unstaged:+unstaged: }${unstaged:-no unstaged diff}, ${staged:+staged: }${staged:-nothing staged}"

jq -n --arg ctx "$ctx" \
    '{hookSpecificOutput: {hookEventName: "PostToolUse", additionalContext: $ctx}}' 2>/dev/null
exit 0
