# Slice Planning

How to plan a vertical slice **before** writing code. The goal is small, focused
PRs which only works if each slice has a clear scope before it starts.

Lifted from MoneyFlow. Same lifecycle here.

## When to plan

When a slice becomes "next up" (active), fill in the planning block in the
phase file. Don't plan slices that are weeks out — context will be stale by then.

## Where the planning lives

Inline in the phase file, under the slice's task list. The Plan block is
**temporary** — it exists only while the slice is in flight. At most one slice
has a Plan block at a time (the active one); all other slices stay as bare
checklists.

**The Plan block is deleted in the same PR that ships the slice**, not after
merging. This keeps `main` clean: there's never a window where the merged
branch has a stale Plan block. The Plan content is preserved in the PR
description, which is its permanent home.

For non-trivial design decisions discovered during planning, write an ADR in
`docs/decisions/`.

## Two templates: Full Plan vs. Light Plan

In an agent-led repo, not every slice needs a full Plan block. Use judgment.

### When to use a Full Plan

Slices involving:
- Security-sensitive code (auth, sessions, env handling, secret management)
- Schema migrations (DB changes are hard to roll back cleanly)
- A new pattern not yet in the codebase (this PR sets a precedent)
- Cross-cutting changes (touches many files / multiple resources)
- Anything with open design questions

### When to use a Light Plan

Slices that are:
- Straightforward CRUD page following an existing pattern in the repo
- Obvious extensions of working code (e.g., "add delete button" after create/edit/list exist)
- Polish slices (styling, copy, error message improvements)
- Bug fixes with a known root cause

### Full Plan template

```markdown
#### N.M: [Slice name] [PR]

##### Plan

**Scope (in)**
- Bullet list of what this PR touches.
- File-level granularity is good ("app/expenses/page.tsx").

**Scope (out)**
- Things explicitly deferred to later slices.
- Anything tempting to bundle in but doesn't belong here.

**Design decisions**
- Key calls being made (link to ADRs for the big ones).
- Method/component signatures if non-obvious.

**Acceptance criteria**
- What needs to be true for this to ship.
- Tests passing, lint green, manual smoke check (if applicable).

**Open questions**
- Anything I'm unsure about — resolve before coding.

##### Tasks

- [ ] ...the actual checklist
```

### Light Plan template

```markdown
#### N.M: [Slice name] [PR]

**Scope**: [one sentence describing the user-facing outcome]
**Out** (optional): [only if something tempting is being deferred]

##### Tasks

- [ ] ...
```

The slice lifecycle (mark tasks, copy plan → PR description, delete plan
block) is the same for both — the difference is how much is written upfront.

## Rules of thumb

- **Scope (out) is as important as Scope (in)**. Naming what's NOT in the PR
  is the most reliable way to keep PRs small.
- **One slice = one concern**. If the "Scope (in)" has two unrelated items,
  it's two slices.
- **Open questions block coding**. Resolve them in design discussion first —
  don't start coding with unanswered design questions.
- **Acceptance criteria should be checkable**. "Tests pass" is fine. "Code is
  clean" is not — it's not measurable.

## The cycle

1. **Slice becomes "next up"** → fill in the Plan block in the phase file.
2. **Discuss open questions** with user → resolve before coding.
3. **Implement** (Mode 2 default — `implementer` subagent or main thread).
4. **Tests + lint + typecheck green** locally.
5. **Adversarial review** via `reviewer` subagent (recommended for non-trivial slices).
6. **Pre-PR cleanup** (all in one commit, part of the slice's PR):
   - Mark all tasks `[x]` in the phase file.
   - Copy the Plan block content into the PR description (Summary / Scope / Test plan).
   - **Delete the Plan block** from the phase file.
7. **Open PR** → paste URL into the conversation for visibility.
8. **Merge** → `main` is immediately clean. No stale Plan blocks ever land on `main`.
9. **Retrospect** → if the slice hit avoidable friction (see threshold in `docs/lessons.md`), append an entry using the template there. No friction → skip. The reviewer subagent may also surface lesson candidates in its report — check those before deciding.
10. **Update** `docs/roadmap/README.md` if a slice or phase status changed.

### Why "delete in the PR, not after"

If deletion happened after merge, `main` would briefly contain a stale Plan
block between the slice merge and a follow-up cleanup PR. By bundling the
deletion into the slice's own PR, the cleanup is atomic with the work, and
the PR description preserves the planning content permanently.

## What a "good" slice looks like

- **One concern**: a page, a server action, a Prisma migration + seed update.
- **30 minutes to review**: a reviewer can hold the whole change in their head.
- **Tests included**: every PR ships with the tests that cover its code.
- **Independently mergeable**: doesn't depend on an unmerged sibling PR.

## What's NOT a slice

- "Implement all of Phase 3" — that's the whole phase, multiple slices.
- "Refactor + new feature" — split into "refactor" PR + "feature" PR.
- "Big bang infrastructure change" — break into independently reviewable steps.
