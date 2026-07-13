# ADR-0020: Cash-basis money model — partner spending stays out of my budget

Date: 2026-07-12
Status: Accepted
Supersedes: [ADR-0018](./0018-money-movements-not-settlement-ritual.md) §3 (the `Movement.fundedByPartner` toggle + "partner's money is a card-payment tag") and its "money the partner sends is not its own entry" framing
Amends: [ADR-0019](./0019-two-sided-couple-balance.md) — the two-sided net **concept** survives; its **input sources** change, and its "I owe {partner}" = `Expense{paidBy:"gf"}` sub-decision is reversed
Builds on: [spec 0005](../specs/0005-cash-basis-money-model.md) (the durable design record; approved in-session)

## Context

Using the app in prod, the user hit repeated "this doesn't make sense" moments, all
tracing to one root cause: the app stored _my share_ (what I **consumed**) but the
user thinks in _cash that moved through my accounts_. For shared/fronted things
those numbers differ, and two designs conflated them:

1. **"I owe {partner}" stored as `Expense{paidBy:"gf"}`** (ADR-0019) — logged _her_
   spending into _my_ budget; phantom "Cash" charge (BUG-1).
2. **`Movement.fundedByPartner`** (ADR-0018) — encoded two real events (money in +
   card payment) as one, spawning edge cases.

Full problem statement + worked examples: [spec 0005 §1–2](../specs/0005-cash-basis-money-model.md).

## Decision

Adopt a **cash-basis model — store atomic facts, derive every view.** Three ledgers
that never touch: **Budget** (Σ my share, drives 50/25/25), **Settlement** (running
net IOU), **Card balance** (Σ charges − Σ payments, future). Per spec 0005 §3:

1. **"I owe {partner}" is settlement-only, not an expense** — stored as a Movement
   `type: "gf_fronted"` (she fronted, you owe; amount / date / note, no card). Never
   enters expenses, categories, budget, or spend-by-card.
2. **Drop `Movement.fundedByPartner`.** Money from Brenda = plain `gf_received`
   transfer-in; a card payment = plain `card_payment`. Two independent events, never
   coupled.
3. **Money from Brenda is not income** — reduces settlement, stays out of the
   50/25/25 base.
4. **Transfers are cash, not budget expenses** — carry an optional free-text note (a
   label, never a category).
5. **Budget still counts your share** on shared expenses; both `amount` and
   `actualExpenditure` stay stored.
6. **Card balance = charges − payments, source-agnostic. No source tagging, ever.**
7. **The two-sided net balance (ADR-0019) stays** — only its inputs change:
   `yourDebtToPartner` = Σ `gf_fronted`; `moneyPartnerPaidYou` = Σ `gf_received` only.

## Consequences

- Implemented in phases: **CHORE-4** (this pivot — `gf_fronted`, strip `paidBy:"gf"`
  reads, re-point CHORE-1 edit/delete, prod migration), then **CHORE-3** (drop
  `fundedByPartner`), then **CHORE-5** (edit/delete movements + note).
- `Expense.paidBy` becomes vestigial (always `"you"`) — deprecated, dropped from all
  reads.
- **BUG-1 retired** — the phantom Cash charge disappears once no `paidBy:"gf"`
  expenses exist.
- Two **prod data migrations** on real Neon data (spec 0005 §6): survey via Neon MCP,
  show reviewed SQL before executing, idempotent/reversible.
- **Enables** future Card-balance and Cash-position views (spec 0005 §7) on clean
  atomic data.
