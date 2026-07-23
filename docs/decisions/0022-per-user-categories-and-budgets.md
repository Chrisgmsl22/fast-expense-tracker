# ADR-0022: Per-user categories, subcategories, and budgets

Date: 2026-07-22
Status: Accepted

Supersedes: [ADR-0016 §3](./0016-per-month-category-budgets.md) (budgets global / no `userId`).

## Context

Public signup ([CHORE-8.d](../roadmap/chores.json)) turns this from a single-user
personal tool into a real multi-user app. But `Category`, `Subcategory`, and
`CategoryBudget` are **global** — no `userId` — so there is exactly one shared set
of category rows for the whole database. Every signed-up user would read and write
the _same_ category names, colors, and monthly budgets: one user editing a limit
or recoloring a category changes it for everyone.

Expenses, cards, movements, settings, and income are already `userId`-scoped, so
actual spending stays private. Only the category **scaffolding** leaks.

ADR-0016 §3 anticipated exactly this: _"If the app ever goes multi-user, budgets
migrate alongside categories."_ That time is now.

## Decision

1. **Add `userId` to `Category`, `Subcategory`, and `CategoryBudget`** (relations
   to `User`). Each user owns their own copy of the category set.
2. **Uniqueness becomes per-user.** `Category.slug` was globally `@unique`; it
   becomes `@@unique([userId, slug])` (every user may have a `housing`). The budget
   override key `@@unique([categoryId, month])` becomes
   `@@unique([userId, categoryId, month])`.
3. **Each new account is seeded its own default set** via the shared starter-kit
   routine ([CHORE-8.b](../roadmap/chores.json)) — the same 13 categories +
   subcategories the owner has. `isSystemCategory` still marks these as the
   provided defaults; they are now per-user rows, not shared ones.
4. **Owner data migration (mandatory).** Existing global category / subcategory /
   budget rows are assigned to the owner account so nothing orphans. Dev: a Prisma
   migration. PROD: a documented, reviewed-SQL runbook run against real data
   (Neon MCP survey before/after), mirroring the cash-basis migration discipline
   (spec 0005). No expense rows change — they already carry `categoryId`.
5. **Every category/budget read and write is `userId`-scoped** — dashboard
   aggregates, the category repository, the category-budget repository, and the
   `setCategoryBudget` action all filter/stamp `userId`.

## Consequences

- Per-user isolation: a user's categories, colors, and budgets are invisible to
  and unaffected by other users.
- The dashboard category grid, category-detail screen, and inline budget editing
  all read the signed-in user's own rows; existing owner behavior is unchanged
  after the migration.
- The starter kit (8.b) becomes the single source for "what a fresh account
  starts with," used by both the seed and signup — so they cannot drift.
- Per-user category **management** (rename/recolor/add/archive) becomes meaningful
  and is built in [CHORE-8.c](../roadmap/chores.json).
- Slug is no longer a global identifier; any code assuming a globally-unique slug
  must key on `(userId, slug)`.
