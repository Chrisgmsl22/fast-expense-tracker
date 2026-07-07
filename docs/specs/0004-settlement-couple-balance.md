# 0004 — Settlement / couple balance (two-sided net)

**Date**: 2026-07-06
**Status**: Draft (design approved; implementation pending)
**Type**: Feature / domain
**Slice**: 2.12
**Extends**: [spec 0003](./0003-shared-expense-settlement.md) (three-layer model)
**Supersedes**: [ADR-0018](../decisions/0018-money-movements-not-settlement-ritual.md) §4
(the one-sided "partner owes you" reminder)
**Amends**: ADR-0018 §5 — reintroduces a narrow `paidBy="brenda"` path

---

## 1. Problem

Slice 2.6 shipped the money-movement journal and a **one-sided** reminder
(`Brenda owes you`) — it can only ever say she owes you, because the app only
records expenses **you** paid. Real life is two-sided and netted: some weeks
Brenda fronts shared things and **you** owe **her**. The user wants a single
running balance that settles to zero, and to **know exactly where the money
goes** — his share of what she fronted must count as spend, in the right bucket.

## 2. Decisions

### 2.1 Balance window — rolling current + previous month

The balance covers **the current month plus the previous month only** — not
unbounded/all-time and not a single month. Brenda usually pays back within the
same week/month; a month-later payback is rare but real, so one month of
carryover is enough. Entries older than the previous month drop off the balance.
The previous-month portion is **called out** in the UI ("from last month").

### 2.2 "I owe Brenda" = an Expense, not a Movement

A debt you owe her (your share of shared stuff she fronted) is **cost, not
cash** — so it is stored as `Expense { paidBy: "brenda" }`, reusing the `paidBy`
field shipped in 1.8 for exactly this case.

- `amount` = your share · `actualExpenditure = amount` (all of it is your cost)
- `isShared: false` · category picker, **default an essentials category** · date
  · optional note
- Because it is an Expense, it flows into **"What I really spent"**, the radar,
  the categories grid, and 50/25/25 **automatically** — no aggregation changes.

This is the one narrow amendment to ADR-0018 §5 ("every expense is yours"): a
`paidBy="brenda"` expense is logged **only** from the settlement page, never
from the general `+ Add` menu.

### 2.3 `gf_received` becomes creatable

"Brenda paid me" (cash she sends you directly, not via a card) is added to
`CREATABLE_MOVEMENT_TYPES`. It already exists as a `Movement.type`; it just
never had UI.

### 2.4 The balance formula

```
+ Brenda's 32% of shared expenses you paid   = Σ(amount − actualExpenditure) where paidBy="you"
− Debts you logged "I owe Brenda"            = Σ actualExpenditure           where paidBy="brenda"
− Money Brenda paid you                      = Σ gf_received + Σ fundedByPartner card payments
+ Money you paid Brenda                       = Σ gf_paid
──────────────────────────────────────────────────────────────────────────────────────────────
= balance          > 0 she owes you   ·   < 0 you owe her   ·   = 0 settled
```

All sums scoped to the 2-month window (§2.1). Worked scenarios (all settle to 0):
she owes 1000, pays 1000 → 0 · she owes 1000, you owe 300, she pays 700 → 0 ·
she owes 500, you owe 700, you pay 200 → 0.

### 2.5 Card payments & Brenda's money (the three ledgers never mix)

Per spec 0003 §2, three ledgers stay separate:

| Ledger                                    | Moved by                            | This slice           |
| ----------------------------------------- | ----------------------------------- | -------------------- |
| **Spend** ("what I really spent")         | expenses (your share)               | reads it             |
| **Card outstanding** (charges − payments) | card payments                       | deferred (0003 §4.4) |
| **Couple balance** (who owes whom)        | shared expenses + debts + transfers | **this slice**       |

- A **normal card payment** (your money) touches **only** card outstanding —
  **zero** effect on the couple balance.
- A **`fundedByPartner` card payment** doubles as "Brenda paid you": her money
  passed through you to the card, so it **draws down the balance** exactly like a
  cash `gf_received`. It never inflates spend (card payments never enter spend
  totals — the original charge was already counted), so no double-count.

## 3. UI

_(Mockups use "Ana"; the build keeps `PARTNER_NAME = "Brenda"`.)_

### 3.1 Settlement screen — `/settlement` (2-month window, no month picker)

- **Balance hero**: colored dot + `BRENDA OWES YOU` / `YOU OWE BRENDA` /
  `ALL SETTLED` ✓, large amount, two-sided `you owe ←→ she owes` bar.
  Green / orange / gray.
- **Buttons** (all states): `Log a transfer` (primary) + `+ I owe Brenda`.
- **"How this balance is made"**: the four signed lines (§2.4) → Net balance.
- **Movement journal**: shared expenses (green ✓, +her 32%), "I owe Brenda"
  (un-itemized, −orange), transfers. An **"Earlier months"** divider separates
  previous-month entries; the hero shows _"includes $X from last month"_ when a
  previous-month unsettled portion exists.
- **Mobile**: compact hero, stacked buttons, condensed breakdown + journal.

### 3.2 Dashboard settlement chip

- In the `MonthFeed` footer (right rail), color-coded and clickable → `/settlement`:
  🟠 `You owe Brenda $X` · 🔵 `Brenda owes you $X` · ⚪ `All settled`.
- Shows the running (2-month) balance, labeled so it doesn't read as a month
  total — same figure whichever month is being viewed.
- **Scope out**: the expenses-page feed keeps just its totals.

### 3.3 Add menu + forms

- `+ Add` gains **"Brenda paid me"** (`gf_received`) → Expense / Card payment /
  I paid Brenda / Brenda paid me. _("I owe Brenda" is not here.)_
- The transfer form is generalized to a **direction** (`gf_paid` | `gf_received`).
- New **`PartnerDebtForm`** on the settlement page → creates the
  `Expense{paidBy:"brenda"}` (amount · category default-essentials · date · note).
- **Quick-settle**: the settlement page's `Log a transfer` opens the transfer
  form **prefilled** with the net amount + correct direction (she-owes →
  "Brenda paid me"; you-owe → "I paid Brenda").

## 4. Architecture

Repo layering (pure domain → repository interface → service → thin action, DI by
default param):

- **Domain** `lib/domain/settlement.ts` — `computeCoupleBalance(inputs)` pure fn
  → `{ balance, direction, breakdown[] }`. Reuses `partnerShareTotal`.
- **Repository** — one `getSettlementInputs(userId)` returning the 2-month-window
  sums (§2.4) + the journal rows, behind the existing repository interfaces.
- **Service** `getSettlement(userId)` — assembles balance + breakdown + journal;
  tags each row `carriedOver = row.month === previousMonth`.
- **Actions** (Zod-validated): extend `add-transfer` for `gf_received`; new
  `add-partner-debt`.

## 5. Scope

**In:** the balance domain + service + repo aggregate; `/settlement` route
(hero + breakdown + journal, 3 states, mobile); dashboard chip; "Brenda paid me"
in the Add menu; `PartnerDebtForm`; quick-settle prefill; ADR-0019; tests.

**Out (logged, not dropped):** per-card outstanding balance (0003 §4.4, still
deferred); itemizing Brenda's purchases (never tracked — the lump is enough);
auto-settlement; `income`/`other` movements (stay journal-only — no balance, no
spend); settlement chip on the expenses page.

## 6. Migration

**None.** `paidBy`, `Movement`, `fundedByPartner`, and the `gf_received` type are
all already in the schema. Pure code slice.

## 7. Decision record

**ADR-0019** to be written with the slice: two-sided balance supersedes ADR-0018
§4; narrow `paidBy="brenda"` path amends §5; 2-month rolling window;
`fundedByPartner` bridges into the balance.

## 8. Tests

- Domain: the three worked scenarios (§2.4) + settled + carried-over + the
  2-month cutoff (an entry older than last month is excluded).
- Service + actions (`add-partner-debt`, `gf_received` transfer) + Zod.
- Components: hero 3 states, chip colors, both forms, quick-settle prefill.
- e2e: log "I owe Brenda" → balance flips orange → log a transfer → settles to $0.
- Reviewer loop + real-browser check vs the mock (desktop + mobile + 3 states).
