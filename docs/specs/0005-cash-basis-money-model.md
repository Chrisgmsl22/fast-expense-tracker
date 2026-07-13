# 0005 — Cash-basis money model (partner spending stays out of my budget)

**Date**: 2026-07-12
**Status**: Draft (design approved by the user; implementation pending)
**Type**: Architecture / domain rework
**Chores**: CHORE-4 → CHORE-3 → CHORE-5 (see [`docs/roadmap/chores.json`](../roadmap/chores.json))
**Supersedes**: [ADR-0018](../decisions/0018-money-movements-not-settlement-ritual.md) — the
"`paidBy:"gf"` debt is an Expense that counts as your spend" decision, and
[spec 0004](./0004-settlement-couple-balance.md) §"his share of what she fronted must count as spend".
**Amends**: [ADR-0019](../decisions/0019-two-sided-couple-balance.md) — the two-sided net _concept_
survives; only its **input sources** change (below).
**Kicks off with**: a formal ADR (supersede 0018 / amend 0019) written for sign-off — `docs/decisions/` is protected.

> This spec is the durable record of a long design session. A fresh session should
> be able to start CHORE-4 from this doc alone. The same model rendered visually
> was reviewed and approved in-session (three-ledgers walkthrough).

---

## 1. Problem

Using the app in prod, the user hit repeated "this doesn't make sense" moments,
all tracing to **one root cause**: the app stores _my share_ (what I **consumed**),
but the user thinks in _cash that moved in/out of my accounts_. For anything
shared or fronted, those two numbers differ — and the app conflated them.

Concretely, two designs caused it:

1. **"I owe {partner}" was stored as `Expense{paidBy:"gf"}`** (ADR-0018 / spec 0004).
   That made a thing _she_ paid for show up as _my_ expense — logging **her
   spending into my budget**, appearing as a phantom "Cash" charge (BUG-1), and
   reading like a payment I made when I hadn't.
2. **"Card payment funded by Brenda"** (`Movement.fundedByPartner`) encoded **two
   real events as one**, spawning edge cases: she sends money → I pay a card; vs
   she sends money → I keep it; vs I keep it and later spend it. The user does not
   want to assume her money always becomes a card payment.

The user's mental model is **cash-basis**: _"I spend when my cash leaves. Brenda
logs her own stuff on her side; I only track my money."_

## 2. The model — three ledgers that never touch

One event can produce three different numbers; that's correct, not a bug. Each
answers a different question, and they must not be conflated.

| Ledger                      | Question                                | Formula                                              |
| --------------------------- | --------------------------------------- | ---------------------------------------------------- |
| **Budget**                  | What did I _consume_? (drives 50/25/25) | Σ my share — full amount on solo, my split on shared |
| **Settlement**              | What do Brenda and I owe each other?    | running **net** IOU                                  |
| **Card balance** _(future)_ | What does each card owe?                | Σ charges − Σ payments                               |

_(A 4th, **cash position** = Σ money in − Σ money out, is derivable later if wanted.)_

**Governing principle — store atomic facts, derive every view.** Logic rot comes
from storing _derived_ or _tagged_ state that drifts (exactly what `paidBy:"gf"`
and `fundedByPartner` were). Every view is a pure calculation over atomic events,
so they can't contradict each other.

### 2.1 Worked example — one $1,000 shared grocery on the NU card

- **Budget** += $680 (your 68% share — unchanged, this is your consumption)
- **Settlement**: she owes you $320 (her 32%)
- **NU card balance** += $1,000 (the full charge — cards see the full amount)

The card balance uses the **full amount** (`Expense.amount`), not your share.
Both numbers are already stored today (`amount` + `actualExpenditure`), so
budget-vs-cash needs **no schema change**.

### 2.2 The action set (target)

| Action                                                         | Budget            | Settlement                          |
| -------------------------------------------------------------- | ----------------- | ----------------------------------- |
| **Add expense** (amount, category, card/cash, split if shared) | your share        | shared → she owes you her share     |
| **Card payment** (amount, card)                                | —                 | — _(charges already counted)_       |
| **Money from Brenda** (she paid/sent you)                      | —                 | ↓ what she owes you                 |
| **Money to Brenda** (you paid her; optional note)              | —                 | ↓ what you owe her                  |
| **"I owe Brenda"** (rare — she fronted for you)                | —                 | ↑ what you owe her                  |
| **Income** (your earnings)                                     | the 50/25/25 base | — — Brenda's money never lands here |

### 2.3 Netting is already handled — the tracker only settles the _net_

Individual shares are never "paid one by one" — only the net is. Three scenarios,
same $1,000 shared grocery, **budget stays $680 every time**:

- **A** — she owes her $320; she sends $320 → settled.
- **B** — you also owe her $200 → net _she_ owes you $120; she sends $120 → settled.
- **C** — you owe her $400 → her $320 cancels; net _you_ owe $80; you send $80 → settled.

The tracker never claims "she paid her $320 share" — it tracks the running net,
and the budget ($680) is independent of how the net settles.

## 3. Decisions

1. **"I owe {partner}" is settlement-only, not an expense.** Store it as a
   **Movement** (proposed `type: "gf_fronted"` — she fronted, you owe; amount /
   date / note, no card). It never enters expenses, categories, budget, or
   spend-by-card. (Final type name is confirmed in the ADR.)
2. **Drop `Movement.fundedByPartner`.** Money from Brenda is a plain `gf_received`
   transfer-in; a card payment is a plain `card_payment`. Two independent events,
   never coupled. What she sends is not assumed to go anywhere.
3. **Money from Brenda is not income.** It reduces the settlement balance and is
   _cash in_ for awareness, but stays out of the Income ledger so the 50/25/25
   base isn't polluted. No new "settlement income" section — the settlement page
   is that place.
4. **Transfers are cash movements, not budget expenses.** A settlement payment is
   a _net residual_, not consumption — categorizing it would pollute the budget.
   It carries an optional **free-text note** ("cat food + drinks") — a label, never
   a category.
5. **Budget still counts your share** on shared expenses ($680), even though the
   Expenses view headline shows the full cash you paid ($1,000). Both are stored.
6. **Card balance = charges − payments**, source-agnostic — a payment is a payment
   regardless of whose money funded it. **No source tagging, ever** (that was the
   bug). Card balance is a _future_ view; the atomic data already supports it.
7. **The two-sided net balance (ADR-0019) stays.** Only its inputs change (§4).

## 4. What changes in the code (grounded in current source)

- **Schema** (`prisma/schema.prisma`): add Movement `type "gf_fronted"`; remove
  `Movement.fundedByPartner`; `Expense.paidBy` becomes vestigial (always `"you"`) —
  deprecate.
- **`lib/domain/settlement.ts` / settlement.service**: `SettlementInputs` change —
  `yourDebtToPartner` = Σ `gf_fronted` movements (was Σ `actualExpenditure` of
  `paidBy:"gf"` expenses); `moneyPartnerPaidYou` = Σ `gf_received` **only** (drop
  the `fundedByPartner` term). `partnerShareOfYourExpenses` is **unchanged**.
- **Journal** (`SettlementJournalItem`): `partner_debt` reads from movements;
  remove the `funded_card_payment` kind.
- **`addPartnerDebt` / `updatePartnerDebt`**: write a Movement, not an Expense.
  Re-point CHORE-1's settlement-page edit/delete onto the movement.
- **Expense reads**: drop `paidBy:"gf"` from the expenses list, dashboard
  categories/radar/buckets, and `getCardSpends` (the BUG-1 phantom disappears for
  free — no filter needed once no such expenses exist).

## 5. Decomposition & order

**CHORE-4 → CHORE-3 → CHORE-5.** (Full plans in `chores.json`.)

1. **CHORE-4 — "I owe" → settlement-only** _(foundation; reverses ADR-0018)_.
   The model pivot. Includes the ADR, the `gf_fronted` move, stripping
   `paidBy:"gf"` from all reads, re-pointing CHORE-1's edit, and a **prod data
   migration** (existing `paidBy:"gf"` expenses → `gf_fronted` movements). Retires BUG-1.
2. **CHORE-3 — decouple partner money from cards** _(foundation; depends on CHORE-4)_.
   Remove `fundedByPartner` + the funded-card journal kind; split existing funded
   card payments into `gf_received` + `card_payment` (**prod migration**); simplify
   the settlement help copy.
3. **CHORE-5 — edit/delete money movements + note** _(least urgent; depends on CHORE-3)_.
   `updateMovement` action + edit mode on the card-payment / transfer forms;
   optional note on transfers. Mirrors CHORE-1's dialog pattern.

## 6. Prod-data migration — handle with care

Both CHORE-4 and CHORE-5 rewrite **real financial data** in Neon prod. For each:
survey current rows via the **Neon MCP**, write the migration as reviewed SQL,
**show the SQL to the user before executing**, and prefer a reversible/idempotent
approach. Never run a blind bulk update on prod.

## 7. Out of scope (enabled, not built here)

- **Card balance** view (charges − payments, per card, + starting balance).
- **Cash position** view (money in − money out).

Both become clean future chores once the atomic model above lands.

## 8. Kickoff checklist for a fresh session (CHORE-4)

1. Confirm `[chores]` shows CHORE-4 available; branch `feat/CHORE-4-…` off up-to-date `main`.
2. Draft the ADR superseding 0018 / amending 0019 from §3 here — **get user sign-off** (protected file).
3. Implement §4 behind the smallest testable slice first, so the user can confirm hands-on.
4. Migration per §6. Then CHORE-3, then CHORE-5.

## 9. References

- Chore plans: [`docs/roadmap/chores.json`](../roadmap/chores.json) (CHORE-3/4/5)
- Reversed/amended: [ADR-0018](../decisions/0018-money-movements-not-settlement-ritual.md),
  [ADR-0019](../decisions/0019-two-sided-couple-balance.md),
  [spec 0003](./0003-shared-expense-settlement.md), [spec 0004](./0004-settlement-couple-balance.md)
- Bug retired by CHORE-4: BUG-1 in [`docs/roadmap/bugs.json`](../roadmap/bugs.json)
