# ADR-0016: Per-month category budgets

Date: 2026-07-01
Status: Accepted

## Context

Category limits were a single `Category.monthlyBudget` value applied to every
month for all time. Real budgets vary month to month (a bigger Health limit the
month of a procedure, a leaner Dining limit in January). Slice 2.5 (Category
detail) surfaced this: the user wants to **edit a category's limit per month**,
with a **default** that applies to months they haven't customized — and to do it
inline on the category screen, not only in a future Settings screen.

Two things had to be decided: how to model per-month overrides, and whose
budgets they are.

## Decision

1. **New `CategoryBudget` table** — `(categoryId, month "YYYY-MM", amount)`, unique
   on `(categoryId, month)`. One optional override row per category per month.
2. **`Category.monthlyBudget` stays as the DEFAULT.** The effective limit for a
   month is resolved by a single pure helper —
   `budgetForMonth(defaultBudget, override) = override ?? defaultBudget` (may be
   `null` → "no limit"). This resolution is used in **both** read paths: the
   category-detail screen and the dashboard category grid, so the grid's bars
   reflect the viewed month's effective limit.
3. **Budgets are global (no `userId`)** — they hang off `Category`, which is
   itself a global/system table (categories are shared system rows, per the
   seed + domain reference). This is a single-user personal app; per-user
   budgets are out of scope. If the app ever goes multi-user, budgets migrate
   alongside categories (the same future work `Category.monthlyBudget` would
   already need). The write action still requires an authenticated session.
4. **Editing happens inline on the category screen** (a pencil on the "Monthly
   limit" card → a dialog with _this month_ + _default_ fields). A future
   Settings screen (2.9) may also expose the same action; it is not required here.

The write lives behind a `CategoryBudgetRepository` (port) with a Prisma adapter,
and a `setCategoryBudget` server action orchestrates validation → auth → persist,
per the layered architecture ([ADR-0015](./0015-layered-architecture-and-di.md)).

## Consequences

- The month string is the CDMX-frame `YYYY-MM` the rest of the app already uses
  (`getMonthRangeUtc`), so no new date semantics.
- The dashboard grid gains a per-month budget lookup; a month with no overrides
  behaves exactly as before (pure default), so existing data is unaffected.
- "No limit" is expressible two ways (no override + null default), both resolving
  to `null` — the helper collapses them, so callers see one notion of "no limit".
- Scope was intentionally expanded into slice 2.5 rather than deferred to a
  separate slice (user call): the screen ships read + edit together.
