# ADR-0000: Using Architecture Decision Records

Date: 2026-05-24
Status: Accepted

## Context

This is an agent-led repo. Design decisions are at risk of being made
implicitly inside agent turns and lost when the conversation ends. Six months
from now, nobody (human or agent) will remember *why* a certain pattern was
chosen, and the reasoning behind non-obvious trade-offs will be gone. This
makes future changes risky.

## Decision

Capture significant architecture and design decisions as ADRs (Architecture
Decision Records) stored in `docs/decisions/`. Each ADR is a short markdown
file that records one decision and the reasoning behind it.

### Format

Every ADR follows this structure (Michael Nygard's template):

```markdown
# ADR-NNNN: Short Imperative Title

Date: YYYY-MM-DD
Status: Proposed | Accepted | Deprecated | Superseded by ADR-XXXX

## Context
What is the problem? What forces are at play?

## Decision
What did we decide?

## Consequences
What are the trade-offs? Both positive and negative.
```

### Conventions

- **Filename**: `NNNN-short-kebab-case-title.md` (zero-padded 4-digit prefix).
- **Numbering**: monotonic, never reused. Skip numbers if needed.
- **Immutability**: once a decision is `Accepted`, never edit the body. If we
  change our mind later, write a new ADR that supersedes the old one, and add
  `Superseded by ADR-XXXX` to the old ADR's status line.
- **Granularity**: one decision per ADR. Don't batch unrelated decisions.

### When to write an ADR

Write an ADR when:
- The decision involves a meaningful trade-off worth explaining.
- A future contributor (or agent) would reasonably ask "why was this done this way?"
- The decision is hard to reverse (schema choices, auth flow, hosting).
- We deliberately defer a feature (YAGNI is a real decision).

Don't write an ADR for:
- Implementation details handled by code reviews.
- Style/formatting choices (those belong in linter configs).
- Library version bumps without behavioral changes.

### Agent responsibilities

When an agent encounters a significant decision *during implementation* that
isn't covered by an existing ADR, it must:

1. **Pause** before committing the decision in code.
2. **Surface** the decision in the conversation with the user.
3. **Write an ADR** (or ask the user to) before proceeding.

This rule is enforced by the `reviewer` subagent — it flags any meaningful
design decision not backed by an ADR.

## Consequences

**Positive:**
- Decisions and their rationale live next to the code, not in chat history.
- New sessions (and new agents) can read `docs/decisions/` to understand the architecture.
- Forces explicit thinking about trade-offs before committing.

**Negative:**
- Small overhead per decision (~10 min to write an ADR).
- Requires discipline to actually write them when decisions are made.
