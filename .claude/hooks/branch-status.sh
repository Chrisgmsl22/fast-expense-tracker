#!/usr/bin/env bash
#
# SessionStart hook: branch-sync detector.
#
# Read-only. Fetches origin, then tells the agent whether the current branch's
# work has already landed in origin/main (PR merged) or is still in flight.
# It NEVER mutates git state — detection only. The agent acts on the verdict
# per the "Branch-sync policy" in CLAUDE.md.
#
# Verdict relies on `git merge-base --is-ancestor`, which is correct for the
# repo's merge-commit strategy. Squash/rebase merges rewrite commit SHAs, so a
# merged branch would read as NOT-an-ancestor → the "in progress" branch below
# tells the agent to confirm via the GitHub MCP before trusting it.

set -uo pipefail

DEFAULT_BRANCH="main"
REMOTE="origin"
REMOTE_MAIN="${REMOTE}/${DEFAULT_BRANCH}"

emit() {
  # $1 = context string injected into the model's context for this session.
  jq -n --arg ctx "$1" \
    '{hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: $ctx}}'
  exit 0
}

# Bail quietly if we're somehow not in a git repo (hook is project-scoped, so
# this shouldn't happen, but never let the hook error out and spam startup).
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

# Refresh remote refs. Non-fatal: offline shouldn't block session start.
git fetch "$REMOTE" --quiet 2>/dev/null || true

# No remote main to compare against → nothing useful to say.
git rev-parse --verify --quiet "refs/remotes/${REMOTE_MAIN}" >/dev/null 2>&1 \
  || emit "[branch-status] No ${REMOTE_MAIN} ref found; skipped branch-sync check."

BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo HEAD)"

# ahead/behind vs origin/main: left = behind, right = ahead.
read -r BEHIND AHEAD < <(git rev-list --left-right --count "${REMOTE_MAIN}...HEAD" 2>/dev/null || echo "0 0")

# Working-tree cleanliness — decides whether the agent may auto-switch.
if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
  TREE="dirty"
else
  TREE="clean"
fi

# --- On main ----------------------------------------------------------------
if [ "$BRANCH" = "$DEFAULT_BRANCH" ]; then
  if [ "$BEHIND" -gt 0 ]; then
    emit "[branch-status] On ${DEFAULT_BRANCH}, ${BEHIND} commit(s) behind ${REMOTE_MAIN} (tree: ${TREE}). ACTION: git pull --ff-only before starting work."
  fi
  emit "[branch-status] On ${DEFAULT_BRANCH}, up to date with ${REMOTE_MAIN} (tree: ${TREE})."
fi

# --- Detached HEAD ----------------------------------------------------------
if [ "$BRANCH" = "HEAD" ]; then
  emit "[branch-status] Detached HEAD (tree: ${TREE}). ACTION: checkout a branch before working."
fi

# --- On a feature/topic branch ---------------------------------------------
if git merge-base --is-ancestor HEAD "$REMOTE_MAIN" 2>/dev/null; then
  emit "[branch-status] On '${BRANCH}'. Its commits ARE in ${REMOTE_MAIN} → PR merged. Tree: ${TREE}. ACTION (CLAUDE.md branch-sync policy): if tree is clean → checkout ${DEFAULT_BRANCH}, git pull --ff-only, then delete LOCAL branch '${BRANCH}' (git branch -d). If tree is dirty → STOP and report the uncommitted changes; do not switch."
fi

emit "[branch-status] On '${BRANCH}'. Commits NOT in ${REMOTE_MAIN} yet (ahead ${AHEAD}, behind ${BEHIND}, tree: ${TREE}). Likely work-in-progress. Per CLAUDE.md branch-sync policy: the git ancestor check is blind to squash/rebase merges, so before assuming unmerged, confirm the PR state for '${BRANCH}' via the GitHub MCP (mcp__github__pull_request_read / list_pull_requests by head branch). If MERGED → treat as the merged case (switch + pull + delete local). If OPEN/none → summarize what remains on this slice for the user."
