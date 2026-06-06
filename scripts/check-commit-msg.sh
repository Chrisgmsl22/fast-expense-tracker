#!/usr/bin/env bash
#
# Non-blocking commit-message size warning (commit-msg hook).
#
# Warns on an over-long subject or a bloated body — see the rules in
# docs/conventions/pr-strategy.md §Commit guidelines (subject ≤72, imperative,
# stands alone; body omit-by-default, 1–3 lines, never restate the diff).
# NEVER blocks the commit. Always exits 0.

set -uo pipefail

msg_file="${1:-}"
[ -n "$msg_file" ] && [ -f "$msg_file" ] || exit 0

# Drop git's comment lines; keep the real message.
content=$(grep -vE '^[[:space:]]*#' "$msg_file")

# Subject = first non-blank line.
subject=$(printf '%s\n' "$content" | sed '/^[[:space:]]*$/d' | head -1)
sub_len=${#subject}
if [ "$sub_len" -gt 72 ]; then
    echo "⚠ commit-msg: subject is $sub_len chars (>72) — tighten it: \"$subject\""
fi

# Body = non-blank, non-trailer lines beyond the subject.
nonblank=$(printf '%s\n' "$content" |
    sed '/^[[:space:]]*$/d' |
    grep -vcE '^(Co-authored-by|Signed-off-by|Refs|Closes|Fixes):' || true)
nonblank=${nonblank:-0}
body=$((nonblank - 1))
[ "$body" -lt 0 ] && body=0
if [ "$body" -gt 5 ]; then
    echo "⚠ commit-msg: body is $body lines — omit-by-default is 1–3. Don't restate the diff; whole-change context belongs in the PR description."
fi

exit 0
