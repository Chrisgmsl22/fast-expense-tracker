# Parallel Slicing

How to structure phases for parallel agent work in this repo.

This convention extends [slice-planning.md](./slice-planning.md) (per-slice
Plan block format) and [pr-strategy.md](./pr-strategy.md) (vertical-slice
philosophy). Where they conflict, this doc wins for parallelism decisions.

## Why this exists

MoneyFlow's slice philosophy assumes a single human (the user) implements
sequentially. In fast-expense-tracker, agents implement and the user
reviews — so the bottleneck is the user's review time, not implementation
time.

Two consequences:

1. Slices need to be **smaller** (target ≤400 LOC including tests). Larger
   PRs lead to rubber-stamp review.
2. Slices need to be **parallelizable** where possible — multiple agents
   can work simultaneously as long as their file footprints don't overlap.

## The pattern: Foundation → Fan-out → Integration

Within a phase, slices fall into three roles:

### Foundation (1 per phase, sequential)

The first slice in a phase. Lands the shared scaffolding that everything
else builds on. Small but unblocks the rest of the phase.

**What goes into a Foundation slice:**

- Prisma schema migrations for the phase (yes, the *whole* phase's schema
  in one slice — DB changes don't fan out cleanly)
- Shared TypeScript types (Zod schemas, derived types)
- Empty page routes / route shells
- Shared server-side utilities (e.g., `getMonthSummary`, `getRecurringForCloning`)
- Anything that defines the **shape** the fan-out slices will fill in

**Foundation slices are reviewed with extra scrutiny.** The `reviewer`
subagent should know: foundation slices set patterns that fan-out slices
inherit, so issues compound. Mistakes here cost the most.

### Fan-out slices (2-4 per phase, parallel-capable)

Each fan-out slice touches **disjoint files**. Different agents can work
concurrently with no merge conflicts.

**File-boundary rules:**

- Each fan-out slice owns its component files exclusively
  (`components/summary/SummaryCard.tsx` ≠ `components/summary/CategoryTable.tsx`).
- Shared utils were established in the Foundation slice. Fan-out slices
  *read* them; they don't extend them.
- Each fan-out slice writes its own tests, in its own test files.

**If two fan-out slices need to touch the same file:**

- Move the shared change into the Foundation slice, OR
- Sequence the two slices (drop parallelism for this pair).

Either decision is fine. Don't try to "carefully merge" two parallel
agents' edits to the same file — it defeats the point.

### Integration slice (1 per phase, sequential after fan-out)

The last slice in a phase. Wires loose ends and adds the Playwright smoke
test that verifies the phase's user-facing feature works end-to-end.

**What goes into an Integration slice:**

- Click-through wiring (e.g., "clicking a list row opens the edit modal")
  — depends on both the list row component AND the modal
- Cross-fan-out behavior coordination
- Playwright e2e test covering the phase's main user flow

**Integration slices are small but load-bearing.** A phase isn't shipped
until its Integration slice merges.

**A phase may omit the Integration slice** if its work is purely
infrastructure (Phase 0) — but the *fact* that it's omitted should be
explicit in the phase file.

## Slice IDs and markers

In phase files:

| Marker | Meaning |
|---|---|
| **Foundation** | Sequential — gates the rest of the phase |
| **Parallel** | Can run alongside others in same phase (lists which) |
| **Integration** | Sequential — depends on fan-out, ships last |

Slice IDs follow `N.M` (phase.slice) format from
[slice-planning.md](./slice-planning.md). Within a phase:

- `N.1` → Foundation (always)
- `N.2`, `N.3`, … → Fan-out (in any order)
- `N.last` → Integration (always)

## Parallelism degree

**Currently capped at 2 agents at once.**

Why this conservative cap:
- The user reviews PRs one at a time; more PRs in flight = more review backlog
- Merge-conflict risk grows with concurrent branches
- v1 caution; raise after building confidence

**To raise the cap when ready:**
1. Confirm fan-out slices remain file-disjoint at higher N.
2. Confirm the user's review bandwidth can absorb N PRs per cycle without
   bottlenecking.
3. Update this doc's cap and note the date.

The dependency graph in the spec (`docs/specs/0001-initial-design.md` §7)
is designed to support up to ~4 parallel agents per phase — the limit is
deliberate, not architectural.

## Cross-phase parallelism

A next-phase Foundation slice can start before the current phase fully
ships, *as long as* it doesn't depend on the current phase's Fan-out or
Integration slices.

The spec's "Dependencies" column on each slice table is the source of
truth. Example: Phase 3 Foundation (`3.1`) depends on slices `1.4`, `1.5`,
`1.6` — once those merge, `3.1` can start in parallel with Phase 2's
fan-out.

In practice the 2-agent cap usually consumes parallelism within a phase,
so cross-phase overlap is rare in v1. The pattern is documented for when
the cap rises.

## Merge-conflict avoidance heuristics

Each fan-out slice should own:

- **Components**: `components/<feature>/<ComponentName>.tsx` —
  one file per agent.
- **Server actions**: `app/_actions/<feature>/<action>.ts` —
  one action file per agent (preferred) or distinct exported function names
  within a shared file (less ideal — sequence instead).
- **Test files**: co-located with source, one test file per source file.

Page-level wiring (the file that imports components and assembles the page)
lives in the **Integration slice**, not in fan-out. Foundation lands the
empty page; fan-out fills in the components; integration wires them up.

## When to add a new agent role

The two named subagents (`implementer`, `reviewer`) are intentionally the
only ones for v1.

**Add a role only when both are true:**

1. The same task-shape comes up across 3+ slices AND has a distinct skill
   set from what the `implementer` is great at.
2. The pain of *not* having the role has shown up at least twice (a slice
   shipped with avoidable issues that a specialized agent would have caught).

**Don't add a role because:**

- A single slice would benefit from specialization. Just tune the
  `implementer`'s instructions for that slice in its Plan block.
- It sounds tidy. Tidiness alone doesn't justify prompt drift.

Adding an agent file later is cheap (`.claude/agents/<name>.md`). There's
no architectural cost to deferring.

## See also

- [slice-planning.md](./slice-planning.md) — Plan block format (per-slice)
- [pr-strategy.md](./pr-strategy.md) — Vertical-slice philosophy
- [agent-workflow.md](./agent-workflow.md) — `implementer` and `reviewer` invocation
- [`docs/specs/0001-initial-design.md`](../specs/0001-initial-design.md) — Per-phase slice tables with dependencies
