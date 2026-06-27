#!/usr/bin/env bash
#
# PreToolUse(Bash) hook: nudge the agent away from two noisy anti-patterns it
# tends to drift into despite the rules, deterministically (memory is advisory;
# a hook is binding):
#
#   1. `cd <repo> && …` — the working directory is ALREADY the repo root, so the
#      `cd` is redundant and can trip a permission prompt. Run commands bare.
#   2. `echo "=== banner ==="` separators wrapped around real command output.
#
# Non-blocking: warns into the agent's context, never denies (mirrors the
# emit-context pattern in env-check.sh). Escalate to a block later if the nudge
# isn't enough.

set -uo pipefail

input="$(cat)"
cmd="$(printf '%s' "$input" | jq -r '.tool_input.command // ""')"

warn=""

# A leading `cd` (at the start, or after a ; && || separator).
if printf '%s' "$cmd" | grep -Eq '(^|[;&|])[[:space:]]*cd[[:space:]]'; then
  warn="${warn}Drop the leading \`cd\` — cwd is already the repo root; run the command bare. "
fi

# An echo carrying a === banner.
if printf '%s' "$cmd" | grep -Eq 'echo[^|;]*==='; then
  warn="${warn}Drop the \`echo \"=== … ===\"\` banner — no separator echoes around output. "
fi

if [ -n "$warn" ]; then
  jq -n --arg ctx "[bash-guard] $warn" \
    '{hookSpecificOutput: {hookEventName: "PreToolUse", additionalContext: $ctx}}'
fi

exit 0
