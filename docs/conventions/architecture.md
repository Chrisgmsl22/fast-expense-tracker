# Architecture & clean-code conventions

Small, firm rules so business logic is testable in isolation and details (DB,
framework) stay swappable. Covers the **whole project** — backend layering is
here; frontend specifics live in [`frontend.md`](./frontend.md). Born from the
expense refactor ([ADR-0015](../decisions/0015-layered-architecture-and-di.md)).
A **living standard** — see [Extending these practices](#extending-these-practices).

## Five principles (whole project)

1. **Pure functions for logic.** Calculations/decisions are functions of their
   inputs — no I/O. Backend: `lib/domain`. Frontend: formatting in `lib/format`,
   derivations in helpers/hooks — never inline in JSX.
2. **Separation of concerns.** Each unit one job. Backend: action orchestrates,
   repository does I/O, domain computes, schema validates. Frontend: container vs
   presentational, hook vs render.
3. **Loose coupling via contracts.** Depend on interfaces and typed props, not
   concretes. Backend: callers depend on a repository **interface**, never
   `import { db }`. Frontend: components depend on typed props (`import type`),
   not on server internals.
4. **Dependency injection — hand-wired, no container.** Pass collaborators;
   default the param to the real instance, pass a fake in tests:
   `fn(input, repo = expenseRepository)`. Wire real instances at one composition
   root. A DI framework is deliberately **not** used — ceremony this app doesn't need.
5. **KISS / YAGNI.** Simplest shape that satisfies the rule. No
   interface/abstraction/hook until there's a real second consumer or a test seam
   that needs it. Name a pragmatic smell rather than over-engineer the cure.

## Backend layering — dependencies point inward

```
Server Action (app/_actions)      orchestration ONLY:
        │                         validate → authenticate → call domain/repo → map to ActionResult
        │  depends on ↓ interfaces + pure functions, never concretes
Domain (lib/domain)               PURE business logic — no db, no Date.now, no env, no framework
Schema (lib/schemas)              Zod validation (pure)
Repository INTERFACE              data-access contract (the "port")
  (lib/repositories/*.repository.ts)
        ▲ implemented by
Prisma adapter (same file)        the ONLY place Prisma/SQL lives; db injected via constructor
Composition root                  wires the real adapter to db — one place
  (lib/repositories/index.ts)
```

- Business logic → `lib/domain` (pure). One aggregate → one repository interface
    - Prisma adapter in `lib/repositories/<name>.repository.ts`.
- Actions/pages/route handlers depend on the **interface**; concretes are wired
  at `lib/repositories/index.ts` and injected (default param).
- Repository **types** and the Prisma **instance** live in separate modules:
  `*.repository.ts` imports only `import type { PrismaClient }` (client-safe);
  `new Prisma…(db)` lives in `index.ts` (server-only). Co-locating leaks Prisma
  into the client bundle.

## Frontend

The same five principles apply to React/Next. Full rules in
[`frontend.md`](./frontend.md). In short: Server Components by default
(`"use client"` only for interactivity); logic in pure helpers/hooks, not JSX;
components depend on typed props; forms are uncontrolled and validated
server-side, rendering `ActionResult` field errors.

## Testing the seam — what to test where

| Layer                 | Test type   | How                                                         |
| --------------------- | ----------- | ----------------------------------------------------------- |
| Domain / pure helpers | unit        | plain inputs/outputs, no mocks                              |
| Schema                | unit        | `safeParse` cases                                           |
| Action orchestration  | unit        | inject a **fake** repository; mock `auth()`                 |
| Repository adapter    | integration | real Postgres                                               |
| Components            | unit        | Testing Library; query by role/label; mock actions + router |

Coverage is an **output** of this design, not a target. Don't chase a percentage
— test the logic and the numbers follow. (A junior enforces 100% line coverage;
a senior builds the seam that makes coverage cheap.)

## Canonical examples — copy these shapes

- **Backend:** expense create/update — `lib/domain/expense.ts`,
  `lib/repositories/expense.repository.ts`, `lib/repositories/index.ts`,
  `app/_actions/expense/{create,update}.ts`,
  `tests/support/fake-expense-repository.ts` + `tests/unit/{create,update}-expense.test.ts`.
- **Frontend:** `components/expense/ExpenseForm.tsx` (uncontrolled form +
  `ActionResult` field errors), `components/ui/button.tsx` (`cva` variants).

## Legacy

`lib/services/user/` predates this pattern. Migrate it to a repository when next
touched; do **not** add new `lib/services/*`.

## Extending these practices

This standard is meant to grow. To add or refine a rule:

1. Propose it in a new ADR (`docs/decisions/`) — the problem, the rule, an example.
2. On acceptance, fold it into this file (or `frontend.md`) and update the
   `implementer` and `reviewer` agents so it's enforced, not just documented.
3. Keep it KISS — a new rule must earn its complexity. Prefer extending a
   canonical example over abstract prose.
