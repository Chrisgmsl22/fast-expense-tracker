# Agent Workflow

How agents work in this repo. This is the harness — the patterns that make
agent-led development reliable.

## Operating model

**Mode 2 default**: agents implement, user reviews.

This inverts MoneyFlow's "user writes, AI mentors" model. Same code-quality bar,
but the human is reviewer rather than author.

## The subagents

Two named subagents live in `.claude/agents/`:

### `implementer`

**When to invoke**: when a slice is "next up" with a complete Plan block and
the user wants to ship it.

**What it does**:
1. Reads the active slice from `docs/roadmap/README.md`
2. Reads the slice's Plan block (Scope in/out, design decisions, tasks)
3. Implements the scope on a `feat/` branch
4. Writes tests
5. Runs lint + typecheck + tests
6. Performs slice-lifecycle cleanup (marks tasks, copies Plan → PR desc, deletes Plan block)
7. Commits and reports back

**Invocation example**:
> "Run the implementer on slice 3.1."

### `reviewer`

**When to invoke**:
- After `implementer` finishes a slice, before opening the PR
- Before merging any PR (even hand-coded ones)
- Spot-check on suspicious changes

**What it does**:
1. Reads the slice's intended scope
2. Reads the diff (`git diff main...HEAD`)
3. Re-reads affected files in full (not just the diff)
4. Cross-references against conventions
5. Produces a structured report: Critical / Important / Nits
6. Marks slice Approved or Rejected with reasons

**The reviewer is adversarial.** It looks for bugs, convention violations,
security issues, silent failures, scope creep, and test gaps. It does NOT
edit code — only reports.

**Invocation example**:
> "Run the reviewer on the current branch before I open the PR."

## When to use built-in subagents

In addition to the project-defined subagents, Claude Code ships several useful
built-ins. Use these too:

| Built-in | Use when |
|---|---|
| `Explore` | Need to map an unfamiliar area of the codebase before implementing. Read-only, fast. |
| `Plan` | Need an architecture-level plan before implementing a multi-file change. |
| `general-purpose` | Open-ended research that doesn't fit a more specific agent. |

The two project subagents (`implementer`, `reviewer`) wrap *slice-level*
workflow. The built-ins wrap *task-level* exploration and planning.

## Slice handoff format

When the user (or main thread) hands a slice to the `implementer`, the handoff
includes:

1. **The slice ID** (e.g., "3.1")
2. **A pointer to the phase file** containing the Plan block
3. **Any clarifications** that came from design discussion but didn't make it into the Plan block

The implementer reads the rest from the repo.

## Review handoff format

When handing to the `reviewer`:

1. **The branch name** or PR URL
2. **The slice ID** (so reviewer can find the spec)
3. **Anything to focus on** (optional — e.g., "auth code, paranoid mode")

The reviewer returns a structured report (see its definition for format).

## When NOT to use a subagent

- **Trivial work** (one-file edits, doc tweaks, dependency bumps). Just do it in main thread.
- **Open-ended exploration** ("how should we structure X?"). Use main thread with `Plan` or just talk it through.
- **Already in flight** in main thread. Don't fork mid-task.

## Filesystem isolation: single-slice vs parallel-slice flows

How a subagent's filesystem changes reach the repo depends on **how the orchestrator invokes it**, not on what the subagent does. The orchestrator (main thread, you, or whatever is launching the subagent) picks the isolation mode; the subagent always creates its own feature branch as step 1 regardless.

### Single-slice flow (default)

When **only one slice is in flight**, no worktree is needed:

1. Orchestrator invokes `implementer` **without** an isolation flag.
2. Subagent creates a feature branch off `main` in the current working directory: `git checkout -b feat/N.M-name`.
3. Subagent edits files in-place; changes are visible to the user in the canonical repo path.
4. Subagent commits on the feature branch; reports back.
5. User pushes + opens PR.

This is the default for sequential slices (Foundation and Integration types in `parallel-slicing.md`).

**Known caveat**: in some Claude Code runtimes, a subagent invoked without explicit isolation may run in an ephemeral working copy whose changes don't persist back to the parent. If you invoke an `implementer` and it reports success but `git status` / `git branch` on the parent shows nothing landed, that's the symptom. Two remediations:

- Re-invoke with `isolation: "worktree"` (see parallel-slice flow below) so a real on-disk worktree captures the work.
- Implement in main thread instead. Slower for the orchestrator but always persists.

Surface either remediation immediately; don't keep re-invoking blind.

### Parallel-slice flow (trigger: a second slice is invoked while a first is in flight)

The moment the user (or main thread) starts a **second slice while the first hasn't merged**, both slices need worktrees. Two subagents working in the same directory will collide on files, lockfiles, `node_modules/`, dev-server ports, and `.next/` build artifacts.

The trigger is concrete: **second slice invocation = move to worktrees for both**. Not a heuristic, a mechanical rule.

1. Orchestrator invokes each `implementer` with `isolation: "worktree"`.
2. Each subagent gets its own on-disk worktree (sibling directory; same `.git`, different branch).
3. Each subagent creates `feat/N.M-name` inside its worktree; works there; commits.
4. User inspects each worktree by `cd`-ing into it.
5. After PR merges, the worktree is removed (`git worktree remove <path>`).

Concrete worktree commands and path conventions live in [`parallel-slicing.md`](./parallel-slicing.md#worktree-mechanics).

### Decision table

| Situation | Isolation | Where work lives |
|---|---|---|
| One slice in flight; sequential | None (default) | Canonical repo path |
| One slice in flight; previous subagent failed to persist | `isolation: "worktree"` OR main thread | Worktree path OR repo path |
| Two slices in flight (parallel fan-out) | `isolation: "worktree"` for both | Two sibling worktree paths |
| Trivial one-file edit | None — main thread, no subagent | Repo path |

### What the subagent assumes

Subagents do not pick their isolation mode. They assume:

- They are already in the working directory their work should land in.
- Their **first action** is `git checkout -b feat/N.M-name` (per `implementer.md` step 1).
- They never `git worktree add` themselves — that's the orchestrator's job, done before invocation.

## What the harness gives you

1. **Reviewable PRs.** Small slices, defined scope.
2. **Adversarial second-look.** Reviewer subagent catches what implementer misses.
3. **Convention enforcement at multiple checkpoints.** Pre-commit + CI + reviewer.
4. **Audit trail.** Every slice's Plan block lives in its PR description forever.

## Anti-patterns

- **Agent-pile-on**: invoking 5 subagents back-to-back without reviewing between. Always read a subagent's output before invoking the next.
- **Reviewer rubber-stamp**: if reviewer keeps saying "approved with no notes," it's not actually adversarial. Sharpen the reviewer prompt.
- **Skipping reviewer for "small" changes**: small changes are where bugs hide. Especially anything touching auth, env, or migrations.
- **Bundling slices**: "while we're here, let me also..." → STOP. Open another slice.
