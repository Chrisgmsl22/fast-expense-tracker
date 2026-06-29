# ADR-0015: Layered Architecture & Dependency Injection

Date: 2026-06-28
Status: Accepted

## Context

The expense server actions had grown to interleave four concerns in one
function: Zod validation, authorization, business math (`actualExpenditure`),
and Prisma data access. Symptoms:

- The `actualExpenditure` rule was **duplicated inline** in `create.ts` and
  `update.ts` — change one, forget the other.
- Actions imported `db` directly, so the **only** way to test orchestration
  (not-found, FK mismatch, db-error mapping) was against real Postgres with a
  seeded user and a mocked session.
- The Zod-issue→`fieldErrors` mapping was copy-pasted across actions.

The deeper point (the trigger for this work): enforcing 100% line coverage is a
junior heuristic; the senior move is to **design for testability** — push logic
into pure functions and put a seam in front of I/O so tests are cheap. Coverage
then follows for free. We want this as a standing rule for all new work, the
`implementer`, and the `reviewer` — not a one-off cleanup.

## Decision

Adopt a layered architecture built on five principles (full detail in
[`docs/conventions/architecture.md`](../conventions/architecture.md);
frontend specifics in [`frontend.md`](../conventions/frontend.md)):

1. **Pure functions** for business logic (`lib/domain`).
2. **Separation of concerns** — actions orchestrate only.
3. **Loose coupling via interfaces** — data access behind a repository
   **interface** (port); a Prisma class is the adapter.
4. **Dependency injection, hand-wired** — collaborators injected via a default
   parameter (`fn(input, repo = expenseRepository)`), real instances wired at
   one composition root (`lib/repositories/index.ts`). **No DI container.**
5. **KISS / YAGNI** — no abstraction without a real second consumer or test seam.

The expense create/update flow is the **reference implementation**. New
aggregates copy its shape. `lib/services/*` is retired (the existing
`lib/services/user/` migrates when next touched). These rules are enforced by the
`implementer` and `reviewer` agents and cross-linked from `coding-conventions.md`.

### Why not the alternatives

- **Status quo (services only).** No interface seam — orchestration stays
  un-unit-testable. Rejected.
- **Full DI container (tsyringe / InversifyJS).** Decorators, reflect-metadata,
  runtime wiring — ceremony a single-user app doesn't need, and it hides the
  mechanism rather than teaching it. Rejected as over-engineering (principle 5).
- **Pure-domain extraction only, no repository.** Wins ~80% of testability but
  leaves actions coupled to `db`. Adopted as a step, not the destination.

## Open question — `actualExpenditure` rounding

Extracting `computeActualExpenditure` surfaced a latent decision: it returns the
**raw float** product (`33.33 × 0.68 = 22.6644`), stored unrounded. This
preserves prior behavior. Whether to round to centavos (and how — half-up vs
banker's) is **deferred** until money precision actually bites (dashboard totals
/ settlement). Recorded here and as a test in `tests/unit/expense-domain.test.ts`
so it isn't silently "fixed" mid-refactor.

## Consequences

**Positive**

- Orchestration is unit-testable with an injected fake repository — no DB.
- The data layer is swappable; the contract is compiler-enforced (`implements`).
- One obvious place (`lib/domain`) for business rules; one (`lib/repositories`)
  for data access.

**Negative / cost**

- One extra file per aggregate (interface + adapter) and a small indirection.
  Accepted: bounded by KISS (no container, one repository per aggregate, types
  split from the instance for client-safety).

## Extending

This is a living standard — propose new rules via a follow-up ADR, then fold them
into the convention docs and the agents (see `architecture.md` §Extending).
