#!/usr/bin/env bash
#
# Exercises branch-status.sh and worktree-status.sh against a throwaway repo
# built in mktemp -d (never the real checkout). Exits non-zero on any verdict
# mismatch.

set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOOKS="$ROOT/.claude/hooks"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

export GIT_AUTHOR_NAME=test GIT_AUTHOR_EMAIL=test@example.com
export GIT_COMMITTER_NAME=test GIT_COMMITTER_EMAIL=test@example.com
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1

fails=0
pass() { printf 'ok   %s\n' "$1"; }
fail() {
    printf 'FAIL %s\n     got: %s\n' "$1" "$2"
    fails=$((fails + 1))
}

# ctx <dir> <hook> → the hook's additionalContext text, run from <dir>.
ctx() {
    (cd "$1" && CLAUDE_PROJECT_DIR="$1" bash "$HOOKS/$2.sh" 2>/dev/null) \
        | jq -r '.hookSpecificOutput.additionalContext // empty'
}

# expect <case> <text> <must-match> [<must-not-match>]  (extended regexes)
expect() {
    local name="$1" text="$2" yes="$3" no="${4:-}"
    if printf '%s' "$text" | grep -Eq -- "$yes" \
        && { [ -z "$no" ] || ! printf '%s' "$text" | grep -Eq -- "$no"; }; then
        pass "$name"
    else
        fail "$name" "$text"
    fi
}

# Fixture: main = c1 → c2 (pushed to a local bare origin).
#   fresh   = branch at c2 (zero commits of its own)
#   merged  = branch at c1 (tip trails main → its work is in main)
#   ahead   = branch at c2 + c3 (unmerged work)
P="$TMP/primary"
git init -q --bare "$TMP/origin.git"
git init -q -b main "$P"
git -C "$P" commit -q --allow-empty -m c1
git -C "$P" branch -q merged
git -C "$P" commit -q --allow-empty -m c2
git -C "$P" remote add origin "$TMP/origin.git"
git -C "$P" push -q -u origin main
git -C "$P" worktree add -q "$TMP/wt-fresh" -b fresh main
git -C "$P" worktree add -q "$TMP/wt-merged" merged
git -C "$P" worktree add -q "$TMP/wt-ahead" -b ahead main
git -C "$TMP/wt-ahead" commit -q --allow-empty -m c3

# --- branch-status.sh --------------------------------------------------------
expect "branch-status: on main, up to date" \
    "$(ctx "$P" branch-status)" 'On main, up to date with origin/main'

expect "branch-status: fresh branch at main → not merged" \
    "$(ctx "$TMP/wt-fresh" branch-status)" 'no commits of its own' 'PR merged'

expect "branch-status: branch behind main → merged" \
    "$(ctx "$TMP/wt-merged" branch-status)" 'PR merged'

expect "branch-status: branch ahead of main → work-in-progress" \
    "$(ctx "$TMP/wt-ahead" branch-status)" 'work-in-progress' 'PR merged'

# --- worktree-status.sh ------------------------------------------------------
wt_line="$(ctx "$P" worktree-status)"
expect "worktree-status: 4 worktrees listed" "$wt_line" '\[worktrees\] 4 active'
expect "worktree-status: primary on main, untagged" "$wt_line" 'primary \(primary\) \[main\]'
expect "worktree-status: fresh worktree at main → untagged" "$wt_line" 'wt-fresh \[fresh\]'
expect "worktree-status: worktree tip trails main → likely merged" "$wt_line" 'wt-merged \[merged — likely merged\]'
expect "worktree-status: worktree ahead of main → untagged" "$wt_line" 'wt-ahead \[ahead\]'
expect "worktree-status: ACTION names only the merged worktree" \
    "$wt_line" 'ACTION .*wt-merged \(merged\)' 'wt-fresh \(fresh\)|wt-ahead \(ahead\)'

# --- main behind origin -------------------------------------------------------
git -C "$P" reset -q --hard HEAD~1
expect "branch-status: on main, behind origin/main" \
    "$(ctx "$P" branch-status)" 'On main, 1 commit\(s\) behind origin/main'

printf '%d failure(s) in %ds\n' "$fails" "$SECONDS"
[ "$fails" -eq 0 ]
