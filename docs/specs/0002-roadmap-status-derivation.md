# 0002 — Roadmap status derivation

**Date**: 2026-06-05
**Status**: Draft (design approved; implementation pending)
**Type**: Internal tooling / process
**Supersedes part of**: the hand-maintained "Currently active" pointer in
[`docs/roadmap/README.md`](../roadmap/README.md)
**Related**: [`session-handoff.md`](../conventions/session-handoff.md),
[`parallel-slicing.md`](../conventions/parallel-slicing.md), the SessionStart
branch-sync hook (`.claude/hooks/branch-status.sh`)

---

## 1. Problem

The roadmap's "Currently active" pointer (in `roadmap/README.md` and echoed in
each phase file's header) is a **derived value maintained by hand**. When a slice
PR merges, the slice's own status flips in its PR — but advancing the global
pointer to the next slice is a separate, orchestrator-owned manual step. It is
routinely forgotten, so a fresh session reads a stale pointer (e.g. "1.1 next up"
after 1.1 already shipped) and a human has to correct it.

The project's own conventions already diagnose the root cause:

> "**Source of truth = per-slice status markers.** 'Currently active' is just the
> orchestrator's index over them." — [`session-handoff.md`](../conventions/session-handoff.md)

An index over other data should be **computed**, not transcribed. This spec makes
it computed.

Three questions every agent needs answered at session start, currently requiring
human intervention:

1. **What slice am I on?**
2. **What slices are available to pick up?** (dependencies satisfied, not already done/claimed)
3. **What is in flight elsewhere?** (other branches / worktrees / open PRs — for the 2-agent parallel cap)

## 2. Goals / non-goals

**Goals**

- Eliminate the hand-maintained "Currently active" pointer; make it generated.
- Auto-answer the three questions above at every SessionStart, with zero manual upkeep.
- One engine that serves **both** solo (one branch, no worktrees) and **parallel**
  (up to 2 worktrees, per the v1 cap) — solo is the degenerate case.
- Provide a mid-session refresh (parallel state changes within a session).
- Stay robust: no silent failures from prose drift.

**Non-goals (YAGNI)**

- No CI enforcement in v1 (a guard is sketched in §10, deferred until it bites).
- No raising the 2-agent parallelism cap (orthogonal; see `parallel-slicing.md`).
- No replacement of phase files — they keep the human narrative (Plan blocks, tasks, descriptions).
- No live cross-machine coordination — "in flight" is derived from git refs + PRs, not a daemon.

## 3. Core model — static manifest, derived status

The design splits **slow-changing structure** (the slice dependency graph) from
**fast-changing state** (what is shipped / in progress / available).

- **Structure** lives in a machine-readable manifest, `docs/roadmap/slices.json`.
  It is edited only when slices are _planned or restructured_ — infrequent, deliberate.
- **State is never stored.** It is **derived from git (+ PRs)** every time it is
  needed. Nothing to flip, nothing to advance, nothing to go stale.

### 3.1 Manifest: `docs/roadmap/slices.json`

JSON (not YAML) so the SessionStart shell hook can parse it with `jq` — no parser
dependency, and Node reads it natively for the richer engine.

```json
{
    "branchPattern": "feat/{id}-",
    "slices": [
        {
            "id": "1.1",
            "phase": 1,
            "type": "foundation",
            "title": "Schema + Prisma client + Auth.js config + page shells",
            "dependsOn": []
        },
        {
            "id": "1.2",
            "phase": 1,
            "type": "fan-out",
            "title": "Seed script",
            "dependsOn": ["1.1"]
        },
        {
            "id": "1.3",
            "phase": 1,
            "type": "fan-out",
            "title": "Login UI + session middleware",
            "dependsOn": ["1.1"]
        },
        {
            "id": "1.4",
            "phase": 1,
            "type": "fan-out",
            "title": "Capture modal + create server action",
            "dependsOn": ["1.1"]
        },
        {
            "id": "1.5",
            "phase": 1,
            "type": "fan-out",
            "title": "List view + month filter",
            "dependsOn": ["1.1"]
        },
        {
            "id": "1.6",
            "phase": 1,
            "type": "integration",
            "title": "Edit + delete + Playwright smoke",
            "dependsOn": ["1.4", "1.5"]
        },
        {
            "id": "1.7",
            "phase": 1,
            "type": "fan-out",
            "title": "Observability — Sentry + Speed Insights",
            "dependsOn": ["1.1"]
        }
    ]
}
```

**Fields** (all per-slice fields required except where noted):

| Field                       | Meaning                                                                                                                                                                    |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `branchPattern` (top-level) | template mapping a slice id → its expected branch prefix. Default `feat/{id}-`.                                                                                            |
| `id`                        | `N.M` slice id (string).                                                                                                                                                   |
| `phase`                     | integer phase number.                                                                                                                                                      |
| `type`                      | `foundation` \| `fan-out` \| `integration`.                                                                                                                                |
| `dependsOn`                 | array of slice ids that must be shipped before this slice is available. `[]` = no in-repo dependency (e.g. a Foundation slice whose only deps are a complete prior phase). |
| `title`                     | human label (mirrors the phase-file slice header; informational only).                                                                                                     |

**No `status`, no `branch`, no `pr` fields** — those are all derived (§3.2).

> **Phase-level completeness.** A Foundation slice that "depends on all of Phase 0"
> uses `dependsOn: []` because Phase 0 is already complete; encoding satisfied
> historical phase-deps adds noise. If a future slice must wait on an _incomplete_
> prior phase, list that phase's specific blocking slice ids in `dependsOn`.

### 3.2 Derived state

Given the manifest and git, the engine computes per slice:

| State              | Rule                                                                                                                                      |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **shipped**        | a **merge commit on `origin/main`** references the slice's branch — `git log origin/main --merges --grep "<branchPrefix>"` returns a hit. |
| **in-progress**    | the slice is not shipped **and** a matching ref exists: a local branch, a remote branch (`origin/<branchPrefix>…`), or a `git worktree`.  |
| **available**      | not shipped, not in-progress, and **every** `dependsOn` id is shipped.                                                                    |
| **blocked**        | not shipped, not in-progress, and at least one `dependsOn` id is not shipped.                                                             |
| **mine** (current) | `git rev-parse --abbrev-ref HEAD` maps to this slice via `branchPattern`.                                                                 |

"In flight elsewhere" = the set of **in-progress** slices whose branch/worktree is
not the current one.

### 3.3 Why merge-commit grep works (and its blind spot)

This repo merges PRs via **merge commits**, whose message embeds the source branch
(`Merge pull request #9 from Chrisgmsl22/feat/1.1-schema-auth-shells`). Grepping
merges on `origin/main` for the branch prefix therefore detects "shipped" even
after the branch is deleted locally — purely in git, hook-friendly.

**Blind spot:** squash/rebase merges rewrite commits and produce no
branch-named merge commit, so the grep would miss a genuinely-shipped slice. This
is the _same_ blind spot as the branch-sync hook (`branch-status.sh`), handled the
_same_ way: the deterministic git check runs in the hook; the **agent
cross-checks merged PRs via the GitHub MCP** (`list_pull_requests` /
`pull_request_read` by head branch) when a slice looks unshipped but a PR may have
landed. Git = fast path; MCP = correctness fallback. The repo's merge-commit
strategy keeps the fast path reliable today; the ADR written at implementation
(§9) records this and the caveat.

## 4. Components

1. **`docs/roadmap/slices.json`** — the static slice graph (§3.1). The only
   human-edited artifact, touched only when planning/restructuring slices.

2. **Derivation engine — `scripts/roadmap-status.mjs`** (Node, no external deps:
   native JSON + `child_process` git calls). Computes the §3.2 state and prints a
   compact view. Exit non-zero with a clear message if `slices.json` is missing or
   malformed (no silent failure). Modes:
    - default: print the human/agent-readable status view to stdout.
    - `--json`: emit the computed model as JSON (for the hook to wrap / for tests).
    - `--write`: regenerate the "Currently active" block + phase table in
      `roadmap/README.md` from the manifest (the pointer becomes generated output).

3. **SessionStart hook — `.claude/hooks/slice-status.sh`** — runs the engine in
   `--json` mode and injects the view as `additionalContext`. Read-only; never
   mutates. Registered alongside the existing `branch-status.sh` SessionStart hook.
   Git-only (no MCP — hooks cannot call MCP); the injected text reminds the agent
   to MCP-confirm ambiguous "unshipped" slices per §3.3.

4. **`pnpm roadmap:status`** (package.json script → the engine) — on-demand
   refresh for **mid-session** use. Essential under parallelism: a worktree spawned
   after session start changes the picture, and the SessionStart snapshot is stale
   by then. Runnable by an agent (Bash) or by the human (`! pnpm roadmap:status`).

5. **`pnpm roadmap:status --write`** — regenerates the README pointer/table.
   Run by the orchestrator (or a future post-merge hook) so the human-facing
   landing page stays current without hand-editing.

## 5. Surfaces / output

### 5.1 Solo (one branch, no worktrees)

```
[roadmap] On 1.4 (fan-out) — "Capture modal + create server action".
Shipped: 1.1. Available next: 1.2, 1.3, 1.5. Blocked: 1.6 (needs 1.4, 1.5).
```

### 5.2 Parallel (2 worktrees)

```
[roadmap] On 1.4 (fan-out, this worktree). In flight elsewhere: 1.5 (worktree
fast-expense-tracker-1-5, branch feat/1.5-list-view). Shipped: 1.1.
Available: 1.2, 1.3. ⚠️ Do not claim an in-flight slice. PR status for in-flight
slices is git-inferred — confirm via GitHub MCP if acting on it.
```

Same engine; the parallel view simply has non-empty "in flight" and worktree data.

## 6. Writer model & concurrency safety

Today: workers flip their own slice status; the orchestrator hand-advances the
global pointer. This spec removes **both writes**:

- **No status is written anywhere** — it is derived. Workers do what they already
  do (push a branch, open a PR); that git state _is_ the "in-progress" signal.
  "Shipped" is the merge commit. "Available" is computed.
- **`slices.json` is touched only when planning slices** — adding a phase's slices
  or restructuring deps. This is a deliberate, single-writer (orchestrator) action,
  not part of any concurrent worker PR. → **No `slices.json` merge conflicts** under
  the parallel cap, because parallel _workers_ never edit it.

This preserves the existing single-writer-for-shared-state principle from
`session-handoff.md` — and goes further by making the shared state _derived_ rather
than _written_, so there is nothing to serialize.

## 7. Interaction with the branch-sync hook (0001-era automation)

The two SessionStart hooks are complementary, not overlapping:

- `branch-status.sh` answers **"should I switch/pull/delete my current branch?"**
  (branch lifecycle vs `origin/main`).
- `slice-status.sh` answers **"what slice am I on, what's available, what's in
  flight?"** (roadmap position).

Both share the merge-commit-grep / MCP-fallback pattern for detecting "merged",
and both are read-only git inspectors. They can share a small helper if
duplication grows, but start independent for clarity.

## 8. Migration

1. Author `slices.json` for **all 8 phases (0–7)** in this PR — Phase 0–1 data
   exists in the phase files; Phases 2–7 are backfilled from the spec's per-phase
   slice tables (`0001-initial-design.md` §7). Mechanical, one pass. Backfilling
   everything up front means the derivation answers "what's available" across phase
   boundaries (cross-phase parallelism, `parallel-slicing.md`) from day one.
2. Phase files: **remove the structured `**Type**`/`**Depends on**`/`**Status**`
   fields** from each slice (type + dependsOn move to the manifest; status is
   derived and never stored). Keep slice **titles, descriptions, Plan blocks,
   tasks, and narrative notes** (e.g. ADR pointers) — the narrative the manifest
   deliberately does not hold. Nothing parses phase files for type/deps/status
   after this, so the prose carries no drift risk.
3. `roadmap/README.md`: replace the hand-written "Currently active" block + phase
   table with `roadmap:status --write` output; annotate the section
   **"auto-generated — do not hand-edit."**

## 9. Conventions / CLAUDE.md changes required (sign-off gated)

These touch harness/convention files (rule #6 — escalate + sign-off in the same
conversation as implementation):

- **CLAUDE.md** session-startup: add "read the injected `[roadmap]` view; pick
  from _available_ slices; never claim an _in-flight_ one; MCP-confirm ambiguous
  shipped state."
- **`session-handoff.md`** / **`parallel-slicing.md`**: update the "orchestrator
  hand-advances the pointer" and "workers flip their own status" rules to the
  derived model. The pointer is now generated; status is computed.
- New **ADR** recording: manifest-as-static-graph + fully-derived status, the
  merge-commit-grep detection, and the squash/rebase caveat + MCP fallback.

## 10. Enforcement (deferred — YAGNI)

A future CI guard could assert consistency: for every slice the engine reports
**shipped**, a correspondingly-named PR is actually **merged** (via the GitHub
API), catching the squash/rebase blind spot automatically. Deferred until the
manual MCP cross-check proves insufficient. Documented here so the option isn't
re-litigated.

## 11. Testing

- **Engine unit tests** (`scripts/__tests__/roadmap-status.test.mjs` or co-located):
  feed a fixture manifest + a stubbed git-state object; assert the computed
  shipped/in-progress/available/blocked/mine partition for: solo-on-a-slice,
  parallel-two-worktrees, all-shipped, a blocked slice, an unknown branch
  (chore/\* → "not a slice"), and a malformed manifest (clean error, non-zero exit).
- **Hook pipe-test**: `echo '{}' | bash .claude/hooks/slice-status.sh` emits valid
  SessionStart JSON (per the update-config skill's verification flow).
- Git interaction is isolated behind a thin function so tests stub it without a
  real repo.

## 12. Risks / open questions

- **Branch-naming discipline.** Detection hinges on the `feat/{id}-…` convention.
  Off-pattern branches (like `chore/…`) are correctly ignored as non-slices, but a
  _mis-named_ slice branch would read as "not started." Mitigation: the convention
  is already in use; the engine can warn when a slice has no matching ref _and_ no
  merge commit but a similarly-named branch exists.
- **Squash/rebase** blind spot (§3.3) — mitigated by MCP fallback; revisit if the
  merge strategy changes.
- **Manifest vs phase-file drift** on slice _titles_ — titles are informational in
  the manifest; if they diverge from phase files it's cosmetic, not load-bearing.
  A lint could compare them later (deferred).

## 13. Rollout

Single chore PR (process tooling, not a feature slice — same handling as the
branch-sync automation):

1. `slices.json` (all 8 phases, 0–7).
2. `scripts/roadmap-status.mjs` + tests + `pnpm roadmap:status` script.
3. `.claude/hooks/slice-status.sh` + register in `.claude/settings.json`.
4. README regenerated via `--write`; phase files trimmed of load-bearing status.
5. CLAUDE.md + conventions + ADR (sign-off gated).
