#!/usr/bin/env bash
#
# Non-blocking doc-size warning (pre-commit).
#
# Warns when a staged markdown doc exceeds the soft cap for its type — see
# docs/conventions/doc-structure.md. NEVER blocks the commit: a nudge to
# split-or-justify, not a gate. Always exits 0.

set -uo pipefail

# Soft cap (lines) for a path. 0 = exempt / skip. Order matters: most specific
# first. README anywhere is capped before the generic docs/ default.
cap_for() {
    case "$1" in
    docs/reference/*) echo 0 ;;
    CLAUDE.md) echo 0 ;;
    *README.md) echo 150 ;;
    docs/decisions/*) echo 200 ;;
    docs/conventions/*) echo 300 ;;
    docs/specs/*) echo 400 ;;
    docs/plans/*) echo 600 ;;
    docs/*) echo 300 ;;
    *) echo 0 ;;
    esac
}

staged=$(git diff --cached --name-only --diff-filter=ACM -- '*.md' 2>/dev/null)
[ -z "$staged" ] && exit 0

while IFS= read -r f; do
    [ -z "$f" ] && continue
    [ -f "$f" ] || continue
    cap=$(cap_for "$f")
    [ "$cap" -eq 0 ] && continue
    lines=$(wc -l <"$f" | tr -d ' ')
    if [ "$lines" -gt "$cap" ]; then
        echo "⚠ doc-size: $f is $lines lines (soft cap $cap) — consider splitting, or justify why it's monolithic. (docs/conventions/doc-structure.md)"
    fi
done <<<"$staged"

exit 0
