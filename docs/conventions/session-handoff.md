# Session Handoff

How work survives across agent sessions. The rule: **the repo is the handoff.**
A fresh agent must be able to resume from the standard startup docs alone — no
"dear future agent" temp docs, no dependence on a previous session's chat
context. Those drift, duplicate, and aren't read at startup, so they rot.

## The test: cold-resumable

> Close the chat. Open a blank session. Run the CLAUDE.md startup ritual
> (roadmap README → active phase file → ADRs). Does it know **where we are**,
> **what's next**, **why** past decisions were made, and **what to avoid**?

If yes, the repo carried the work. If no, knowledge is stranded in chat — that's
a **handoff bug**: write the missing piece to its artifact (below) and the bug
is fixed.

| Question                       | Artifact                                                                                                                                                                                         |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Where are we / what's active?  | the SessionStart `[roadmap]` view + `docs/roadmap/README.md` "Currently active (derived)" block — both **generated** from `docs/roadmap/slices.json` + git; run `pnpm roadmap:status` to refresh |
| What's the next slice's brief? | the active slice's **Plan block** in the phase file                                                                                                                                              |
| Why was X decided?             | `docs/decisions/` (ADRs)                                                                                                                                                                         |
| What should I avoid?           | `docs/lessons.md`                                                                                                                                                                                |
| How do I work here?            | `docs/conventions/`                                                                                                                                                                              |
| What changed, when?            | git history + PR descriptions                                                                                                                                                                    |

## When to update: **in the slice's own PR — never deferred**

The slice PR is the unit of handoff. It may not merge until it leaves `main`
**cold-resumable**. Definition of Done for a slice PR:

1. Its tasks marked `[x]` in the phase file.
2. Plan block copied into the PR description, then **deleted** from the phase file.
3. Decisions made → an ADR; friction hit → a `lessons.md` entry (same PR).

There is **no "mark shipped" step**: a slice's shipped state is **derived** from
git (the merge commit on `origin/main`), never written into the phase file. The
README "Currently active" block is likewise generated — see below.

Deferring any of this to "after merge" or "next session" is what creates stale
handoffs. Do it in the PR, atomically with the work.

## Parallelism: status is derived, so there's nothing to race over

Status is **derived, never written.** "Shipped" is the merge commit on
`origin/main`; "in-progress" is a live branch/worktree; "available" is computed
from `slices.json` deps. With two slices in flight (the v1 cap), neither PR
touches any shared status line, so the old "each PR advances the pointer" race
simply cannot occur.

What each writer still owns:

| Artifact                                                       | Owner                                         | When                                        |
| -------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------- |
| A slice's **own** tasks, Plan block, ADR/lesson                | the **slice PR** (worker)                     | in that PR                                  |
| `docs/roadmap/slices.json` (the slice graph: type + dependsOn) | the **orchestrator** — single writer          | only when **planning/restructuring** slices |
| The README "Currently active (derived)" block                  | **generated** — `pnpm roadmap:status --write` | no hand-edits                               |

Rules that fall out of this:

- **Workers edit only their own slice's section** of the phase file and their own
  code files — never the README block, never `slices.json`, never another
  slice's section. (This extends the "fan-out slices own disjoint _files_" rule in
  [`parallel-slicing.md`](./parallel-slicing.md) to disjoint phase-file
  _sections_.)
- **`slices.json` is edited only when planning slices** — a deliberate,
  single-writer (orchestrator) action, never part of a concurrent worker PR. So
  there is no `slices.json` merge contention under the parallel cap.
- **Source of truth = the manifest + git.** "Currently active" is a computed
  index over them (`pnpm roadmap:status`), regenerated, not transcribed.

## Enforcement

Documentation informs; the **reviewer gate** enforces. The `reviewer` subagent's
checklist includes:

- The PR leaves `main` cold-resumable (Plan block moved to the PR description;
  shipped state is derived from the merge, not written).
- The PR touches **only its own slice's** section + files — it does **not** edit
  the generated README block or `slices.json` (except a deliberate planning PR),
  nor another slice's section (a worker that does is a **Critical** finding under
  parallelism).

A later CI guard may add an automated backstop, but the reviewer is the primary
gate because it runs adversarially before every merge.
