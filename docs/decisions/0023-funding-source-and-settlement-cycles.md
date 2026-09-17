# ADR-0023 — Funding source, partner payments in Expenses, and settlement cycles

**Status**: Proposed — awaiting Christian's sign-off
**Date**: 2026-09-14
**Spec**: [0007](../specs/0007-funding-source-and-settlement-cycles.md) — the spec file lands with the settlement-cycles work, which merges before this; the link does not resolve in between.
**Refines**: [ADR-0018](./0018-money-movements-not-settlement-ritual.md) §5 (movements render interleaved in both feeds)
**Amends**: [ADR-0019](./0019-two-sided-couple-balance.md) (the settlement window)
**Upholds**: [ADR-0020](./0020-cash-basis-money-model.md) §1, §4 and §6

## Context

Three complaints shared one root cause: the model knew what cash moved and what
was consumed, but not **whose money, from which month** funded an outflow.

- Shoes bought from savings were never logged, because logging them ate a budget
  the money never came from. Missing data was the real cost.
- Money paid to the partner changed nothing in the expenses view.
- A fully refunded medicine still counted as spend.

## Decision

### 1. The governing rule

The three 50/25/25 buckets answer one question: **how is _this month's income_
being used?** Not what was consumed, and not what cash moved. Counting a
savings-funded purchase double-counts — that income was already recorded as
savings in the month it was set aside.

### 2. An expense carries a funding source

`Expense.fundedFrom` — `income` (default) | `savings` | `reimbursed`. Only
`income` counts toward the budget. Additive migration: every existing row
becomes `income`, so no historical total moves.

### 3. The filter lives at the data boundary

The budget reads exclude non-`income` rows **in the query**, not in the bucket
math. An excluded row is not a smaller number; it is not a row. This means
`computeBuckets` and friends can never see one, so a future change to that math
cannot forget to skip it.

### 4. The card is never source-tagged

Spend-by-card uses the full `amount` whatever funded it. Upholds ADR-0020 §6.
One card payment can settle many purchases, so a single tag could never describe
it honestly — and source-tagging a payment is exactly the bug `fundedByPartner`
was, removed in CHORE-3. The tag goes on the **purchase**.

### 5. `reimbursed` is restricted to Health

Reimbursement in practice means the health-insurance refund. Enforced in
validation on create **and** on update, against a slug resolved server-side, so
moving a reimbursed expense out of Health fails loudly instead of stranding the
value. Loosening this later is a one-line change.

The refund itself is never income — it is the user's own money returning.

### 6. A reimbursement is dated to the month of the expense

March's income funded nothing, so March should say so. The consequence is
accepted deliberately: **a closed month's totals are not immutable.** Reimbursing
a March expense in April lowers March's spend after the fact.

### 7. Partner payments get their own section in Expenses (refines ADR-0018 §5)

A `gf_paid` movement already renders in the expenses feed, interleaved by date
and colour-tagged (ADR-0018 §5). What changes is the presentation: it moves into
a **dedicated section with its own highlight**, so a payment to the partner reads
as its own kind of money rather than one more row in the stream.

This **upholds** ADR-0020 §4 rather than amending it. A transfer stays cash, not
a budget expense, and stays uncategorised — a settlement transfer is a net
residual covering several things at once, so forcing one category onto it would
be a lie. The debt itself (`gf_fronted`) stays settlement-only, per ADR-0020 §1.

### 8. Settlement becomes cycles (amends ADR-0019)

A settlement opens, accumulates, and closes. Closing is **confirmed, never
automatic**; closing N opens N+1 immediately; a late shared expense joins the
**open** cycle. This replaces the rolling current-plus-previous-month window,
which silently dropped anything unsettled older than last month. Reopening a
closed settlement is deliberately not built.

## Consequences

- A purchase from savings is now logged rather than omitted — the data gap closes.
- Closed months can restate. Accepted; §6 explains why.
- Budget totals and card totals now answer different questions by design. Anyone
  reading both must know that a savings-funded row appears in one, not the other.
- No savings balance is tracked. Explicitly rejected by the user: "that would add
  another place to keep track of, and it could drift."

## Alternatives rejected

| Alternative                                          | Why not                                                           |
| ---------------------------------------------------- | ----------------------------------------------------------------- |
| Tag the card payment instead of the purchase         | One payment settles many purchases; the tag could never be honest |
| Categorise the partner transfer as consumption       | Breaks on netting — some months there is no transfer at all       |
| Keep a savings balance                               | A second place to keep track of, and it would drift               |
| Date a reimbursement to the month the refund arrived | March would overstate and April understate                        |

## Scope note

This ADR records the whole of spec 0007. Implemented so far (the `fundedFrom`
slice): decisions 1-6, plus the funding-source half of decision 7 — a `gf_paid`
transfer carries `fundedFrom` and a savings-funded one leaves the cash figures
while still settling the balance in full (spec 0007 §6a decision 5). Decision 7's
dedicated Expenses section, and all of decision 8, land in later slices.
