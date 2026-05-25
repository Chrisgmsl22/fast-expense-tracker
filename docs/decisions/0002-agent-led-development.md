# ADR-0002: Agent-Led Development with Named Subagents

Date: 2026-05-24
Status: Accepted

## Context

The user has two adjacent personal projects with opposite operating models:

- **MoneyFlow (my-expense-tracker)**: Long-form learning project. User writes
  the code; AI mentors. Mode 1 default.
- **fast-expense-tracker (this repo)**: Temporary tool. User needs a working
  app fast; learning isn't the priority. Speed and code quality both matter.

The user explicitly wants this repo to be an **agent-led harness-engineering
practice ground** — to develop the muscle of directing agents on real software
with real stakes (the user's actual financial data), without the slow-learning
constraint of MoneyFlow.

Options considered for how to structure the agent workflow:

1. **Just clear specs** — no formal agent definitions. Any agent picks up a spec and implements.
2. **Named persistent subagents** — define `implementer` and `reviewer` subagents with specific instructions.
3. **Built-in subagents only** — use Claude Code's `Plan`, `Explore`, `code-reviewer` etc. at defined points.

## Decision

Adopt **Mode 2 default with named subagents** for slice-level work.

### Mode 2 default

- Agents implement; user reviews.
- This is inverted from MoneyFlow's `CLAUDE.md` (where the user writes by default).
- Same code-quality bar as MoneyFlow: tests, conventions, ADRs.

### Named subagents

Two subagents live in `.claude/agents/`:

- **`implementer`** — takes a slice with a complete Plan block and ships it end-to-end (code, tests, slice-lifecycle cleanup).
- **`reviewer`** — adversarial review of a slice (committed work or PR) before merge.

These subagents are **persistent** (versioned in git, evolve with the project)
and **named** (invoked by the user via "run the implementer on slice X").

Built-in subagents (`Plan`, `Explore`, `general-purpose`) are still used for
task-level exploration and planning — see
[agent-workflow.md](../conventions/agent-workflow.md) for the boundary.

### Why named over built-ins-only

- **Context efficiency**: A subagent that already knows about
  `docs/roadmap/`, `docs/conventions/`, and the slice lifecycle starts with
  the right priors. Re-explaining every time wastes turns.
- **Consistency**: Two implementer runs against the same spec produce
  comparable outputs. With built-ins, results vary more turn-to-turn.
- **Auditability**: The subagent definition IS the prompt. When something
  goes wrong, we can read the prompt, diff it, improve it.
- **Composability**: `implementer` → `reviewer` is a chain we'll run many
  times. Naming it makes the chain explicit.

## Consequences

**Positive:**

- Clear separation: planning (main thread) → implementation (subagent) → review (subagent) → user merge decision.
- Subagent prompts are themselves harness artifacts — we improve them over time as we learn what works.
- Code-quality bar enforced at multiple checkpoints: pre-commit, CI, reviewer.

**Negative:**

- Subagent prompt drift: if the conventions evolve but the subagent prompts don't, work degrades. Mitigation: subagent prompts reference convention files by path rather than restating rules.
- Over-reliance on subagents for trivial work. Mitigation: `agent-workflow.md` explicitly lists "when NOT to use a subagent."

## How this differs from MoneyFlow

| Aspect | MoneyFlow | fast-expense-tracker |
|---|---|---|
| Default mode | Mode 1 (user writes) | Mode 2 (agents write) |
| Primary value | Deep learning | Speed + working tool |
| Subagents | Use built-ins ad hoc | Named persistent `implementer` + `reviewer` |
| Slice review | User reads diff | Reviewer subagent + user |
| Pace | Slow, deliberate | Fast, opinionated |

Both repos share: conventions, ADR practice, slice-based PR strategy,
security discipline, code-quality bar.
