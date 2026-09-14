#!/usr/bin/env bash
#
# Validates agent definitions (.claude/agents/*.md by default, or the files given
# as arguments): `---` frontmatter with `name` and `description`, and a `tools:`
# value that is a comma-separated list of real tool names. Exit 1 on a violation.

set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ALLOWED="Read Edit Write Bash Glob Grep WebFetch WebSearch Agent TodoWrite NotebookEdit"
status=0

fail() {
    printf '%s: %s\n' "$1" "$2"
    status=1
}

allowed() {
    local a
    for a in $ALLOWED; do
        [ "$a" = "$1" ] && return 0
    done
    return 1
}

if [ "$#" -gt 0 ]; then
    files=("$@")
else
    files=("$ROOT"/.claude/agents/*.md)
fi

for f in "${files[@]}"; do
    [ -f "$f" ] || { fail "$f" "not a file"; continue; }
    rel="${f#"$ROOT"/}"

    [ "$(sed -n '1p' "$f")" = "---" ] || { fail "$rel" "line 1 is not '---'"; continue; }
    close="$(awk 'NR > 1 && $0 == "---" { print NR; exit }' "$f")"
    [ -n "$close" ] || { fail "$rel" "frontmatter has no closing '---'"; continue; }
    fm="$(sed -n "2,$((close - 1))p" "$f")"

    printf '%s\n' "$fm" | grep -Eq '^name:[[:space:]]*[^[:space:]]' \
        || fail "$rel" "frontmatter lacks 'name'"
    printf '%s\n' "$fm" | grep -Eq '^description:[[:space:]]*[^[:space:]]' \
        || fail "$rel" "frontmatter lacks 'description'"

    printf '%s\n' "$fm" | grep -Eq '^tools:' || continue
    tools="$(printf '%s\n' "$fm" | sed -n 's/^tools:[[:space:]]*//p')"
    [ -n "$tools" ] || { fail "$rel" "'tools:' is empty — omit the line to grant all tools"; continue; }

    IFS=',' read -ra items <<<"$tools"
    for item in "${items[@]}"; do
        t="$(printf '%s' "$item" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')"
        [ -n "$t" ] || { fail "$rel" "empty item in 'tools:' (stray comma)"; continue; }
        case "$t" in
            *[[:space:]]*) fail "$rel" "'$t' in 'tools:' contains whitespace — separate tools with commas" ;;
            mcp__*) ;;
            *) allowed "$t" || fail "$rel" "unknown tool '$t' in 'tools:' — comma-separated real tool names only" ;;
        esac
    done
done

[ "$status" -eq 0 ] && echo "OK — agent frontmatter valid (${#files[@]} file(s))."
exit "$status"
