#!/usr/bin/env bash
#
# SubagentStart hook: environment sanity check.
#
# Before a subagent does any work, verify it's operating on the REAL, current
# repo — not a stale / divergent / phantom tree. The invariant: HEAD must
# CONTAIN the current origin/main (i.e. this branch was cut from up-to-date
# main). If it doesn't, the environment is suspect and the agent must stop.
#
# Read-only. Warns loudly into the subagent's context; never blocks — the
# Step-0 preflight in the agent definitions (.claude/agents/*.md) is what
# enforces the stop, so the guard survives even if an isolated environment
# never loads this hook.

set -uo pipefail

emit() {
  jq -n --arg ctx "$1" \
    '{hookSpecificOutput: {hookEventName: "SubagentStart", additionalContext: $ctx}}'
  exit 0
}

git rev-parse --is-inside-work-tree >/dev/null 2>&1 \
  || emit "[env-check] Not a git repo — cannot verify the working environment. Confirm where you are before editing."

# Refresh remote refs. Non-fatal: offline shouldn't hard-fail the check.
git fetch origin --quiet 2>/dev/null || true

git rev-parse --verify --quiet refs/remotes/origin/main >/dev/null 2>&1 \
  || emit "[env-check] ⚠️ MISMATCH: no reachable origin/main. This may be an isolated/divergent environment — STOP and report (git log --oneline -3) before editing or committing."

HEAD_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
MAIN_SHA="$(git rev-parse --short origin/main 2>/dev/null || echo unknown)"
BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo HEAD)"

if git merge-base --is-ancestor origin/main HEAD 2>/dev/null; then
  emit "[env-check] ok — '${BRANCH}' (HEAD ${HEAD_SHA}) contains current origin/main (${MAIN_SHA}). Real repo confirmed."
fi

emit "[env-check] ⚠️ MISMATCH: HEAD ${HEAD_SHA} ('${BRANCH}') does NOT contain current origin/main (${MAIN_SHA}). You may be in a stale / divergent / phantom tree. STOP — do not edit or commit. Report what you see: git log --oneline -3 && git status -sb."
