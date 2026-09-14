#!/usr/bin/env bash
#
# SessionStart hook: worktree inventory + stale-worktree detector.
#
# Read-only. Lists git worktrees and flags any whose branch has already landed
# in origin/main (PR merged) as safe to remove. NEVER mutates state — the agent
# acts on the verdict per the worktree-retirement rule in AGENTS.md.
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
    # Primary checkout: branch-status.sh already reports its branch; never
    # remove the primary.
    marker=" (primary)"
  else
    marker=""
    # "Likely merged" = the branch is an ancestor of origin/main AND its tip
    # trails it. Ancestry alone also matches a fresh branch sitting exactly AT
    # main; the tip comparison removes that case (docs/lessons.md 2026-08-05).
    #
    # Residual false positive: a fresh worktree whose base already trails
    # origin/main has a trailing tip too and reads as merged. Residual false
    # negative: squash/rebase merges rewrite SHAs and defeat ancestry. The
    # MCP-confirm step in the ACTION text and the never-remove-uncommitted rule
    # are the safety net for both.
    if [ "$branch" != "(detached)" ] && [ "$branch" != "$DEFAULT_BRANCH" ] \
       && git merge-base --is-ancestor "refs/heads/${branch}" "refs/remotes/${REMOTE_MAIN}" 2>/dev/null \
       && [ "$(git rev-parse "refs/heads/${branch}" 2>/dev/null)" \
            != "$(git rev-parse "refs/remotes/${REMOTE_MAIN}" 2>/dev/null)" ]; then
      tag=" — likely merged"
      action="${action} ${path} (${branch}): confirm the PR merged (GitHub MCP), then \`git worktree remove ${path}\` + \`git branch -d ${branch}\`."
    fi
  fi

  summary="${summary} • ${path}${marker} [${branch}${tag}]"
  idx=$((idx + 1))
done < <(git worktree list 2>/dev/null)

if [ -n "$action" ]; then
  emit "${summary}. ACTION (AGENTS.md worktree retirement):${action} Never remove a worktree with uncommitted changes; report it instead."
fi

emit "${summary}."
