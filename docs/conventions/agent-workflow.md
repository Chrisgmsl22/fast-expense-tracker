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
