# 0003 — Shared-expense settlement (bidirectional)

**Date**: 2026-06-16
**Status**: Draft (design approved; implementation pending)
**Type**: Domain model / feature
**Supersedes**: the one-directional settlement design in
[`0001-initial-design.md` §Settlement convention](./0001-initial-design.md)
**Reshapes**: Phase 2 (slices 2.5/2.6) and Phase 4 (dashboard stats); adds a
new schema migration after the shipped 1.1.

---

## 1. Problem

The original design models settlement **one-directionally**: only the user
pays shared expenses, the app computes "Owed to you," and the reverse case
(girlfriend paid, user owes her) is declared **out of scope** and faked via a
"Combined Expenses" category. Real life is bidirectional and netted:

- Either partner pays a shared expense → the other owes their split share.
- Debts accumulate **both ways** and are **netted** at settlement ("she owes
  300, I owe 200 → I net +100").
- The actual money that moves is a **single transfer**, recorded as-is — and
  its amount is **decoupled** from the computed debt (partial payments, paying
  some now and carrying the rest, etc.).
- The user logs ~100% of card activity + monthly cash, and wants to see both
  **what the cards charged** and **what he actually spent** (his share).

## 2. Core model — three layers that never contaminate each other

The whole design rests on keeping these separate:

1. **Expenses → your share.** Each expense stores its **raw amount** (what the
   card/cash statement shows) and `actualExpenditure` (your share per the
   split). Your share is **what you actually spent** — fixed at log time,
   independent of who paid or whether it's settled. **This is the dashboard
   number.** Netting never mutates an expense row.
2. **Couple balance.** Computed from shared expenses (both payers); drawn down
   by the actual transfer **movements** you log. A live "she owes you net X."
   Reference only — never auto-applied to expenses.
3. **Cash / card.** What actually left your wallet: per card,
   `charges − card-payments = outstanding`. Settlements and card payments move
   cash here, not in layer 1.

### The invariant (the reassurance)

**Once everything is settled, total cash you've paid out = sum of your shares.**
Your "actually spent" number is correct from the moment you log, regardless of
settlement timing. Settlement just moves real money until your wallet agrees
with it. Worked example in §6.

## 3. Schema changes

A new **additive migration** (1.1 already shipped). Two changes:

### 3.1 `Expense.paidBy`

```prisma
paidBy String @default("you")   // "you" | "gf"
```

Records who fronted the money. Drives the couple balance and lets the card
views attribute charges only to expenses the user paid.

### 3.2 New model `Movement`

A lightweight log of **actual money events** — any amount, decoupled from what
is "owed". Not an expense; never enters spend totals.

```prisma
model Movement {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])

  date      DateTime
  amount    Float                 // always positive; direction comes from type
  type      String                // see below
  cardId    String?               // set when type = "card_payment"
  card      Card?    @relation(fields: [cardId], references: [id])
  note      String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

`type` values:

| `type`         | Meaning                                 | Affects                          |
| -------------- | --------------------------------------- | -------------------------------- |
| `gf_received`  | she transferred money to you            | couple balance (↓ what she owes) |
| `gf_paid`      | you transferred money to her            | couple balance (↓ what you owe)  |
| `card_payment` | you paid down a card (`cardId` set)     | that card's outstanding          |
| `income`       | one-off money in (e.g. sold headphones) | journal note only                |
| `other`        | anything else worth recording           | journal note only                |

### 3.3 Superseded fields

`Expense.settlementStatus` and `Expense.paidAt` (added in 1.1 for the
one-directional model) are **dropped** by this migration — the running-balance
model tracks settlement via the couple balance + movements, not per-expense
flags. Safe to drop: no capture UI has shipped, so there is no production
expense data. (Confirm empty `Expense` table before the destructive step.)

## 4. Derived computations (queries, never stored)

### 4.1 Your real spend (the "what I actually spent" view)

```
Σ actualExpenditure   over the period
```

Your share of every shared expense (yours **and** gf-paid) + 100% of personal
expenses. Her share never counts. Settlement-independent.

### 4.2 Card spent (gross) vs your spend (net)

| View               | Formula                                    | Answers                        |
| ------------------ | ------------------------------------------ | ------------------------------ |
| Card spent (gross) | Σ `amount` where `paidBy = "you"`, by card | "what my cards charged"        |
| You spent (net)    | Σ `actualExpenditure`                      | "my true cost after the split" |

`gross − net` = the slice fronted-for-others / shared — itself a useful stat.

### 4.3 Couple balance

```
Σ(gf-share of shared expenses you paid)        // she owes you
  − Σ(your-share of shared expenses she paid)   // you owe her
  − Σ(gf_received) + Σ(gf_paid)                 // actual transfers logged
= net (positive = she owes you)
```

### 4.4 Per-card outstanding

```
per card:  Σ(amount where paidBy="you" on that card)  −  Σ(card_payment to that card)
```

**Accuracy is logging-completeness-bound** — true only if every charge on the
card is logged. Labeled in the UI as "based on logged expenses," not the bank's
balance.

## 5. What changes in the plan

- **Phase 1 (post-1.1):** a new schema-migration slice for `paidBy` + `Movement`
    - dropping `settlementStatus`/`paidAt`. (Slice id assigned during planning.)
- **Phase 2:** slices **2.5/2.6 are redesigned** — replace one-directional "Owed
  to you" + settle-up with the bidirectional **couple balance** + **Movement log**
  (`gf_received`/`gf_paid`). The capture/edit form gains the **`paidBy`** control.
- **Phase 4:** add the **gross-vs-net** and **per-card outstanding** stats to the
  dashboard (the user's "two graphs").
- **`0001` §Settlement convention** is superseded; the "Combined Expenses
  category as reverse-settlement hack" note is removed.

## 6. Worked example (70/30, you = 70%)

| Expense   | Paid by | Gross | Your share             |
| --------- | ------- | ----- | ---------------------- |
| Groceries | you     | 1000  | 700 (she owes you 300) |
| Dinner    | she     | 500   | 350 (you owe her 350)  |

- **You actually spent** = 700 + 350 = **1050** (stable, settlement-proof).
- Couple balance: she owes 300, you owe 350 → **net you owe 50**.
- Settle: you log `gf_paid 50`. Cash out = 1000 (groceries) + 50 = **1050** = your
  share total. Invariant holds.
- Partial/decoupled is fine: you could log `gf_paid 30` now and carry 20 — the
  balance just shows 20 remaining. Nothing in layer 1 moves.

## 7. Non-goals (keep it not-overkill)

- **No account-balance reconciliation** — no statement import, no starting
  balances, no interest. Per-card outstanding is derived from logged data only.
- **No auto-settlement** — the app never nets or marks things paid on its own;
  every movement is user-entered.
- **No multi-person splitting** — strictly the two-person (you / gf) model.

## 8. Open questions (deferred to their slices)

- Exact `paidBy` representation (string enum vs a tiny `Person` table). Default
  to the string enum unless a slice finds a reason otherwise.
- Whether `income`/`other` movements ever feed the 50/25/25 income side (default:
  **no** — they're journal notes; 50/25/25 income stays `Settings.monthlyIncome`).
- Where the couple-balance and outstanding widgets live in the weekly-review vs
  dashboard surfaces — resolved when 2.x/4.x are planned.
