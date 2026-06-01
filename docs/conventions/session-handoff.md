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

| Question | Artifact |
|---|---|
| Where are we / what's active? | `docs/roadmap/README.md` ("Currently active") |
| What's the next slice's brief? | the active slice's **Plan block** in the phase file |
| Why was X decided? | `docs/decisions/` (ADRs) |
| What should I avoid? | `docs/lessons.md` |
| How do I work here? | `docs/conventions/` |
| What changed, when? | git history + PR descriptions |

## When to update: **in the slice's own PR — never deferred**

The slice PR is the unit of handoff. It may not merge until it leaves `main`
**cold-resumable**. Definition of Done for a slice PR:

1. Its tasks marked `[x]` in the phase file.
2. Plan block copied into the PR description, then **deleted** from the phase file.
3. The slice **marked shipped** in the phase file.
4. Decisions made → an ADR; friction hit → a `lessons.md` entry (same PR).

Steps 5–6 (advancing the global pointer + staging the next brief) are the
**orchestrator's** job, not the slice PR's — see parallelism below.

Deferring any of this to "after merge" or "next session" is what creates stale
handoffs. Do it in the PR, atomically with the work.

## Parallelism: split ownership so concurrent slices don't drift

With two slices in flight (the v1 cap), the naive "each PR advances the pointer"
rule races and conflicts — both PRs would edit the same shared lines, and one
"Currently active" line can't name two slices. Fix by separating **who writes
what**:

| State | Owner | When |
|---|---|---|
| A slice's **own** status (its tasks, its "shipped", its Plan block, its ADR/lesson) | the **slice PR** (worker) | in that PR |
| The global **"Currently active" pointer** + **staging next briefs** | the **orchestrator** (main thread) — single serial writer | at spawn + after merges |

Rules that fall out of this:

- **Workers edit only their own slice's section** of the phase file and their own
  code files — never the global pointer, never another slice's section. (This
  extends the "fan-out slices own disjoint *files*" rule in
  [`parallel-slicing.md`](./parallel-slicing.md) to disjoint phase-file
  *sections*.)
- **"Currently active" names a set**, not one slice (e.g. `0.3 + 0.4 in flight`).
- **Orchestrator stages all in-flight Plan blocks up front** (at spawn), and
  **reconciles the pointer to the next set after merges** — serially. One writer
  for shared state = no race.
- **Source of truth = per-slice status markers** (each owned by exactly one
  writer). "Currently active" is just the orchestrator's index over them.

## Enforcement

Documentation informs; the **reviewer gate** enforces. The `reviewer` subagent's
checklist includes:

- The PR leaves `main` cold-resumable (its slice marked shipped, Plan block moved
  to the PR description).
- The PR touches **only its own slice's** status + files — it does **not** edit
  the global "Currently active" pointer or another slice's section (a worker that
  does is a **Critical** finding under parallelism).

A later CI guard may add an automated backstop, but the reviewer is the primary
gate because it runs adversarially before every merge.
