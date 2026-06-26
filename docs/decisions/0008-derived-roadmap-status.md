# ADR-0008: Derived Roadmap Status (Static Manifest + Computed State)

Date: 2026-06-05
Status: Accepted

## Context

The roadmap's "Currently active" pointer (in `docs/roadmap/README.md` and
echoed in each phase file's `**Status**` lines) was a **derived value
maintained by hand**. When a slice PR merged, advancing the global pointer to
the next slice was a separate, orchestrator-owned manual step — routinely
forgotten. A fresh session then read a stale pointer (e.g. "1.1 next up" after
1.1 already shipped) and a human had to correct it.

The conventions already diagnosed the root cause: "Currently active" is just an
**index over** the per-slice status — and an index over data should be
**computed**, not transcribed.

Three questions every agent needs at session start — what slice am I on, what's
available to pick up, what's in flight elsewhere — all reduced to hand-kept
prose that drifted.

Design: [`docs/specs/0002-roadmap-status-derivation.md`](../specs/0002-roadmap-status-derivation.md).

## Decision

Split **slow-changing structure** from **fast-changing state**:

- **Structure** lives in a static manifest, [`docs/roadmap/slices.json`](../roadmap/slices.json):
  the slice dependency graph (`id`, `phase`, `type`, `title`, `dependsOn`) and a
  `branchPattern`. It is hand-edited **only when planning/restructuring slices** —
  a deliberate, single-writer (orchestrator) action.
- **State is never stored.** Shipped / in-progress / available / blocked / mine
  is **derived from git** every time it's needed, by `scripts/roadmap-status.ts`:
    - **shipped** — a merge commit on `origin/main` references the slice's branch
      prefix (`git log origin/main --merges`, grepped for `feat/<id>-`), **or** a
      `feat(<id>)` conventional commit landed on `origin/main` (covers slices that
      shipped under a differently-named branch — see the blind-spot section).
    - **in-progress** — not shipped, but a live local/remote branch or worktree
      matches the prefix.
    - **available** — not shipped, not in-progress, and every `dependsOn` token is
      satisfied. A token is a slice id (that slice shipped) or `phase:N` (every
      slice in phase N shipped).
    - **blocked** — not shipped, not in-progress, ≥1 unsatisfied dep.

The engine is surfaced three ways: the SessionStart hook
`.claude/hooks/slice-status.sh` (auto `[roadmap]` view), `pnpm roadmap:status`
(mid-session refresh), and `pnpm roadmap:status --write` (regenerates the README
"Currently active (derived)" block — generated output, not hand-edited).

## Detection mechanism + blind spot

This repo merges PRs via **merge commits**, whose message embeds the source
branch (`Merge pull request #9 from Chrisgmsl22/feat/1.1-schema-auth-shells`).
Grepping merges on `origin/main` for the branch prefix detects "shipped" purely
in git — hook-friendly, and robust even after the branch is deleted locally.

**Blind spot:** squash/rebase merges rewrite commits and produce no
branch-named merge commit, so the merge-prefix grep alone would miss a
genuinely-shipped slice. A related case bit us in practice: **slice 1.9 shipped
under `docs/design-handoff` (PR #22), not `feat/1.9-`**, so the merge-prefix grep
reported it `available` for weeks.

**Mitigation — conventional-commit scope fallback (ADR-0013).** Detection now
also treats a slice as shipped when a `feat(<id>)` commit subject appears on
`origin/main` (`git log origin/main --format=%s`, matched on `feat(<id>)`). Because
this repo writes Conventional Commits, the slice id is reliably encoded in the
commit scope even when the _branch_ name doesn't follow `feat/<id>-`. Restricted
to the `feat(` type so planning-only `docs(<id>)`/`chore(<id>)` commits for
not-yet-built slices don't false-positive; the `(<id>)` paren delimiter keeps
`feat(1.1)` from matching `feat(1.10)`.

This is the **same** blind spot as the branch-sync hook (`branch-status.sh`),
handled the **same** way for what the fallbacks still miss: the deterministic git
checks are the fast path; when a slice looks unshipped but a PR may have landed,
the agent **cross-checks merged PRs via the GitHub MCP** (`list_pull_requests` /
`pull_request_read` by head branch). The merge-commit strategy + scope fallback
keep the fast path reliable today; if it changes, the MCP fallback (and the
deferred CI guard in spec §10) cover it.

## Consequences

**Positive:**

- The stale-pointer chore is gone — nothing to advance, nothing to flip.
- No `slices.json` write contention under the 2-agent parallel cap: workers
  never edit it; only deliberate planning PRs do.
- One engine answers solo and parallel views; cross-phase availability is
  computed across all 8 phases from day one.

**Negative / watch:**

- **Phase files no longer carry status/deps/type as truth.** Those fields were
  removed; the manifest (type, dependsOn) and the engine (status) are the source
  of truth. Phase files keep only narrative — titles, descriptions, Plan blocks,
  tasks, and ADR pointers.
- Detection hinges on the `feat/{id}-…` branch convention; a mis-named slice
  branch reads as "not started." Already-in-use convention; low risk.
- The squash/rebase blind spot above — mitigated by the MCP fallback.
