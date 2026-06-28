#!/usr/bin/env bash
#
# SessionStart hook: worktree inventory + stale-worktree detector.
#
# Read-only. Lists git worktrees and flags any whose branch has already landed
# in origin/main (PR merged) as safe to remove. NEVER mutates state — the agent
# acts on the verdict per the "Parallel-work policy" cleanup rule in CLAUDE.md.
#
# Stays silent when there's only the primary checkout (the common case), so it
# adds no startup noise unless parallel worktrees actually exist.

set -uo pipefail

REMOTE="origin"
DEFAULT_BRANCH="main"
REMOTE_MAIN="${REMOTE}/${DEFAULT_BRANCH}"

emit() {
  jq -n --arg ctx "$1" \
    '{hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: $ctx}}'
  exit 0
}

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

# Only the primary worktree → nothing worth saying.
COUNT="$(git worktree list 2>/dev/null | grep -c .)"
[ "${COUNT:-0}" -le 1 ] && exit 0

# Fresh origin/main so the merged check is accurate (non-fatal if offline).
git fetch "$REMOTE" --quiet 2>/dev/null || true

summary="[worktrees] ${COUNT} active:"
action=""
idx=0

while IFS= read -r line; do
  [ -z "$line" ] && continue
  path="${line%% *}"
  case "$line" in
    *\[*\]*)
      branch="${line##*[}"
      branch="${branch%%]*}"
      ;;
    *) branch="(detached)" ;;
  esac

  tag=""
  if [ "$idx" -eq 0 ]; then
    # Primary checkout: branch-status.sh already handles the current branch.
    # Don't evaluate merged-status here (a fresh zero-commit branch reads as an
    # ancestor of main and would be mislabelled), and never remove the primary.
    marker=" (primary)"
  else
    marker=""
    # Linked worktree whose branch is already in main's history → its slice PR
    # likely merged. Ancestry is blind to squash/rebase, so flag for MCP-confirm
    # rather than asserting it.
    if [ "$branch" != "(detached)" ] && [ "$branch" != "$DEFAULT_BRANCH" ] \
       && git merge-base --is-ancestor "refs/heads/${branch}" "refs/remotes/${REMOTE_MAIN}" 2>/dev/null; then
      tag=" — likely merged"
      action="${action} ${path} (${branch}): confirm the PR merged (GitHub MCP), then \`git worktree remove ${path}\` + \`git branch -d ${branch}\`."
    fi
  fi

  summary="${summary} • ${path}${marker} [${branch}${tag}]"
  idx=$((idx + 1))
done < <(git worktree list 2>/dev/null)

if [ -n "$action" ]; then
  emit "${summary}. ACTION (CLAUDE.md parallel-work cleanup):${action} Never remove a worktree with uncommitted changes; report it instead."
fi

emit "${summary}."
