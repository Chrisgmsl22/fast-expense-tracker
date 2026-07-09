# ADR-0019: Two-sided couple balance (settlement)

Date: 2026-07-06
Status: Accepted
Supersedes: [ADR-0018](./0018-money-movements-not-settlement-ritual.md) §4 (the one-sided "partner owes you" reminder)
Amends: ADR-0018 §5 ("every expense is yours")
Builds on: [spec 0003](../specs/0003-shared-expense-settlement.md), [spec 0004](../specs/0004-settlement-couple-balance.md)

## Context

ADR-0018 shipped a **one-sided** reminder: the app only records expenses the
user paid, so it could only ever say "{partner} owes you." It explicitly punted
on a true two-way balance because the app never sees the partner's receipts.

The user wants a single **running balance that settles to zero** and to know
exactly where his money goes — including his share of shared things the partner
fronted, which must count as spend, in the right 50/25/25 bucket.

## Decision

Add a **two-sided couple balance** (slice 2.12), computed over a rolling
**current + previous month** window (spec 0004 §2.1):

```
balance = Σ(partner's 32% of shared expenses you paid)
        − Σ(your share of "I owe {partner}" debts)
        − Σ(gf_received + fundedByPartner card payments)
        + Σ(gf_paid)
```

`> 0` she owes you · `< 0` you owe her · `= 0` settled.

### The "I owe {partner}" entry amends ADR-0018 §5

A debt the user owes is **cost, not cash**, so it is stored as an
`Expense{paidBy:"gf"}` (reusing the `paidBy` field from spec 0003) — categorised,
`actualExpenditure = amount`, unshared. Being an expense, it flows into "What I
really spent" + the radar + buckets with **no aggregation changes**. This is the
one narrow reintroduction of a non-`"you"` `paidBy`: it is logged **only** from
the settlement page, never the general `+ Add` menu, so ADR-0018 §5 still holds
everywhere else.

### `fundedByPartner` bridges into the balance

A `fundedByPartner` card payment (her money, passed through to a card) draws down
the balance exactly like a cash `gf_received`. A normal (own-money) card payment
does not touch the balance. Card payments never enter spend totals, so there's no
double-count. `gf_received` also becomes creatable ("{partner} paid me").

### Not a money movement

The "I owe {partner}" entry is a metric (cost + debt), not a cash event — so it
is an expense, not a `Movement`. Movements stay strictly cash (ADR-0018 §2).

## Consequences

- **No migration** — `paidBy`, `Movement`, `fundedByPartner`, and the
  `gf_received` type all already exist in the schema.
- The one-sided reminder (ADR-0018 §4) is replaced by the `/settlement` screen +
  a running-balance chip in the dashboard month-feed footer.
- The balance is intentionally **not** the dashboard's single viewed month: an
  unsettled debt must survive one month-end. Older than the previous month drops
  off (the user settles within a month or two in practice).
- Because the partner's purchases are still never itemised, the balance's
  "you owe" side depends on the user logging the lump "I owe {partner}" — a
  deliberate, accepted limit carried from ADR-0018.
