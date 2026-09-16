# ADR-0024: The payment you send the partner is the expense

Date: 2026-09-15
Status: Accepted — signed off 2026-09-15
Amends: [ADR-0020](./0020-cash-basis-money-model.md) §1 — upheld for the debt, refined for the payment
Builds on: [spec 0007 §6a–§6b](../specs/0007-funding-source-and-settlement-cycles.md)

> Numbered 0024, not 0023: ADR-0023 is being written on a sibling branch. Renumber
> at review if that one does not land.
>
> **This ADR was rewritten before merge.** Its first draft recorded the opposite
> decision — that a debt the partner fronted becomes an expense. That model was
> built, used for a day, and reversed. The reversal is the subject of this
> document; the superseded version is described in "What the first draft said",
> below, so the record shows the wrong turn rather than hiding it.

## Context

ADR-0020 §1 made "I owe {partner}" a settlement-only `Movement{type:"gf_fronted"}`
— never an expense, never in the budget. Using the app since, the cost showed up
in real numbers. For September 2026 on the live local database:

| Figure                             | Amount    |
| ---------------------------------- | --------- |
| His own expenses, his share        | $1,325.99 |
| What she fronted (debts he logged) | $1,950.00 |
| What he transferred to her         | $8,011.20 |

More of his consumption ran through her than through his own cards, and **none of
it reached a bucket**. The budget understated the month by 60%. In his words:
_"I want it to reach my budget because it is real money from my current month
that I actually spent."_

The first fix made the **debt** the expense. One day of real use broke it: he
logged a carwash she paid at **$500** — her outlay — when his share was about
**$380**. The form was asking him about a purchase he had not made.

## Decision

**The payment you send the partner is the `Expense`. A debt she fronted is
settlement-only.**

1. **A debt is provisional, so it is not spending.** This is the argument that
   settles it, and it is his:

    > _"When I log something I owe to Brenda, I do not want this expense to be
    > filled in immediately… there could be a case where I also owe her, in this
    > case my amount could be reduced or removed. Instead, do not add an expense
    > when I log that I owe Brenda, lets do this when I actually log a payment I
    > make to her, this is more accurate and real based on how we settled."_

    Something she owes you can shrink or cancel a debt before any money moves,
    so booking a debt as spending records a purchase that may never happen. The
    payment is the only part that is certain, because it has already happened.

2. **The marker is a new column, never `paidBy`.** `paidBy` is deprecated, always
   `"you"`, and dropped from every read; reviving it would restore exactly what
   ADR-0020 removed. `Expense.isPartnerPayment` is **write-once** — the
   repository's update shape has no such field — and `updateExpense` clamps a
   payment row's `isShared` / `yourPercentage` / `actualExpenditure`, so the
   ordinary expense form can neither demote a payment nor shrink it by applying
   a split.

3. **The amount is what he sent**, and no split is ever applied: `amount` and
   `actualExpenditure` are equal and `isShared` is false. A debt separately
   records **what he owes**, never her outlay — the ambiguity that produced the
   $500 carwash — and the debt form asks in those words.

4. **One row, one figure, in both ledgers.** A payment is both the cash leaving
   his account and the consumption it funded, so both ledgers read the same row.
   A debt contributes to neither; it only moves the settlement balance. This is
   the practical gain of the reversal: the superseded model needed a
   debt-expense and its settling transfer kept out of each other's ledger by
   hand, and that was the most error-prone rule in the spec.

5. **Settlement reads the payment as the "you paid her" side.**
   `moneyYouPaidPartner` sums payment expenses' `actualExpenditure`;
   `yourDebtToPartner` sums `gf_fronted` movement amounts. Opposite signs, two
   tables, no row on both sides.

6. **A debt never appears in a feed.** It leaves both feeds, every bucket and
   every category rollup: _"adding my debts to her adds too much noise. There's
   the settlement page for that."_ The payment is the feed row, and it keeps the
   gold highlight the transfer had.

## What this PR ships, and what it does not

**Schema only.** `vercel.json` runs `prisma migrate deploy` on every production
build, so merging this PR IS a production migration. Three migrations ship:
`add_settlement_cycle_marker` (ADD COLUMN + CHECK + index),
`fronted_debt_as_expense` (ADD COLUMN) and `payment_is_the_expense` (RENAME
COLUMN). Every statement is DDL. **No data statement ships.**

So production still holds **unconverted** rows, and every read must handle them:

| Legacy row            | Handled by                                                                                                        |
| --------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `gf_paid` movement    | Settlement counts it on the "you paid her" side; the feed footer counts it as cash out and in "Paid to {partner}" |
| `gf_fronted` movement | Unchanged — this is the model's permanent home for a debt                                                         |
| Subcategory name      | The code reads the name live rows hold; the display name is computed at render                                    |

Two rules guard the transition:

- **Never double-count a converted twin.** The deferred conversion reuses the
  movement's id for the expense it creates, so a movement whose id is already a
  payment-expense is dropped before summing — in the settlement service and in
  the feed footer alike.
- **Never sum a legacy transfer into a consumption figure.** A legacy transfer is
  cash whose consumption was never recorded. It joins "what actually left", never
  "what I really spent" (spec 0007 §6a). The feed's `Total` does span both
  ledgers by design until spec 0007 §6b's slice F removes it.

The **data migration is deferred to its own PR**: converting `gf_paid` movements
into payment-expenses, reversing any `isFronted` expense back to a movement, and
renaming the subcategory by id. It is held back so a production data rewrite is
reviewed and released deliberately, not as a side effect of a schema merge.

**Requirement on that PR: the converted expense MUST take the movement's own
id.** Two dedups already shipped — `withoutConvertedTwins` in the settlement
service and the twin filter in `computeFeedTotals` — recognise a converted pair
by nothing else. A conversion that assigns fresh ids, or that leaves the
movements in place, makes both miss silently: every converted transfer would
then count twice, in `paidToPartner`, in the feed's `Total` and in
`moneyYouPaidPartner`. Reuse the id, and delete the movement in the same
transaction that inserts the expense.

## Consequences

- Past months restate upward as payments join the budget. That is the point.
- `Movement.type: "gf_paid"` is legacy: read, never written.
- `Movement.type: "gf_fronted"` is **not** legacy. It is where a debt lives.
- The subcategory is still stored as **"Purchases made by girlfriend"**. Spec
  0007 renames it to "Covered for me", but the seed matches subcategories by
  name, so seeding the new name against unrenamed rows creates a duplicate
  instead of renaming. The rename travels with the data PR; until then the
  screens show "I owed {partner}", computed at render.
- BUG-1's guarantee changes from "by construction" to "by a query filter": a
  payment has no `cardId` either, so `getCardSpends` excludes
  `isPartnerPayment` rows, pinned by name in
  `tests/integration/dashboard-repository.test.ts`.
- A closed settlement cycle is now frozen on the expense side as well as the
  movement side. What freezes is the rows that cycle COUNTED — a partner share
  or a payment to her (`movesSettlementBalance`); editing or deleting one is
  refused with `cycle_closed`, as is an edit that would add a partner share to a
  closed cycle. A solo expense of the same age counts for nothing there and stays
  editable.

## What the first draft said, and why it was wrong

The superseded decision was: _"A debt the partner fronted is an `Expense`
carrying `isFronted: true`."_ Its migration would have converted every
`gf_fronted` movement into an expense.

The objection raised against reversing it was netting: some months net to
nothing, so the consumption a transfer stood in for would vanish. He turned that
argument around, and his version is stronger — **netting is precisely why a debt
must not be an expense**, because netting is the mechanism that can make the
debt disappear before any money moves.

| Concern             | First draft (superseded)           | Shipped                      |
| ------------------- | ---------------------------------- | ---------------------------- |
| The expense         | The debt she fronted               | **The payment you send her** |
| The debt            | Categorised consumption, in budget | **Settlement only**          |
| Reconciling the two | Exclude the fronted row from cash  | Nothing to exclude           |

What survived the reversal, unchanged: the two-ledger rule, `combined-expenses`
as the home, the intent to rename the subcategory, and the principle that a debt
records what he owes and never her outlay.
