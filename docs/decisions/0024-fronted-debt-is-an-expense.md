# ADR-0024: A debt the partner fronted is an expense again

Date: 2026-09-14
Status: Proposed — needs sign-off (`docs/decisions/` is protected)
Amends: [ADR-0020](./0020-cash-basis-money-model.md) §1 — partially reversed
Builds on: [spec 0007 §6a](../specs/0007-funding-source-and-settlement-cycles.md)

> Numbered 0024, not 0023: ADR-0023 is being written on a sibling branch. Renumber
> at review if that one does not land.

## Context

ADR-0020 §1 made "I owe {partner}" a settlement-only `Movement{type:"gf_fronted"}`
— never an expense, never in the budget. Using the app since, the cost showed up
in real numbers. For September 2026 on the live local database:

| Figure                             | Amount    |
| ---------------------------------- | --------- |
| His own expenses, his share        | $1,325.99 |
| What she fronted (debts he logged) | $1,950.00 |

More of his consumption ran through her than through his own cards, and **none of
it reached a bucket**. The budget understated the month by 60%. In his words:
_"I want it to reach my budget because it is real money from my current month
that I actually spent."_

## Decision

**A debt the partner fronted is an `Expense` carrying `isFronted: true`.**

1. **The defect ADR-0020 fixed was never "it reached the budget".** It was BUG-1:
   the row had no `cardId`, and `getCardSpends` groups by `cardId` and reads null
   as cash, so the debt surfaced as a phantom `Cash` segment on the dashboard.
   That is a **read** defect, and it is fixed at that read — `isFronted: false` in
   the `groupBy` where-clause, beside the savings exclusion — not by keeping real
   consumption out of the expense table.
2. **The marker is a new column, never `paidBy`.** `paidBy` is deprecated, always
   `"you"`, and dropped from every read; reviving it would restore exactly what
   ADR-0020 removed. `isFronted` is also **write-once** — the repository's update
   shape has no such field — and `updateExpense` clamps a fronted row's
   `isShared`/`yourPercentage`/`actualExpenditure`, so the ordinary expense form
   can neither demote a debt nor shrink it by applying a split.
3. **The amount logged is his share**, never what she paid. `amount` and
   `actualExpenditure` are equal and `isShared` is false. There is no split to
   apply: the figure entered **is** the consumption.
4. **Consumption and cash stay apart.** The buckets count the **expense**; the
   cash figure counts the **transfer** that settles it. One fronted amount, two
   ledgers, seen exactly once by each — never summed.
5. **Settlement reads the expense as the debt side.** `yourDebtToPartner` sums
   fronted expenses' `actualExpenditure`.

### The dual source, and how it ends

The migration converts every `gf_fronted` movement whose owner has a
`combined-expenses` category, reusing the movement's `id` and `createdAt` so no
settlement cycle moves. An account without that category has nowhere honest to
file the debt, so its movements are left alone and settlement keeps summing them
— losing a debt silently is worse than a second code path.

That fallback is **transitional, not permanent**. Nothing writes `gf_fronted`
anymore, so the set only shrinks; a skipped account is converted by creating the
category and re-running the migration's conversion step. Until then the balance
guards against double counting: a `gf_fronted` movement whose `id` already exists
as a fronted expense is dropped before summing.

## Consequences

- Past months restate upward as their debts join the budget. That is the point.
- `Movement.type: "gf_fronted"` is legacy: read, never written.
- The subcategory "Purchases made by girlfriend" becomes **"Covered for me"** —
  the row is his share, not her purchase, and the old name is partner-specific.
  Renamed in place by id; renaming the starter kit alone would have made the next
  provision create a duplicate.
- BUG-1's guarantee changes from "by construction" to "by a query filter", pinned
  by a test that names the bug.
- A legacy movement-backed debt keeps its delete control but loses its edit form.
