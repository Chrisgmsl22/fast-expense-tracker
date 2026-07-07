# ADR-0018: Money movements, not a settlement ritual

Date: 2026-07-02
Status: Accepted
Supersedes: the `settlement-*.png` 3-step design for slice 2.6 (the PNGs are retired)
Builds on: [spec 0003](../specs/0003-shared-expense-settlement.md), [ADR-0015](./0015-layered-architecture-and-di.md)

## Context

The V1 design for the settlement screen was a rigid 3-step ritual: _you charged
$X → partner gives you her 32% in cash → you pay the card the full statement →
your true cost is 68%_. It assumes every week settles the same clean way.

Reality (confirmed with the user, the only user) doesn't hold that shape:

- Most weeks the partner owes him (her 32% share of what he charged), but some
  weeks **she** has paid for shared things, so he owes her too. They **net** it
  in their heads — "she owes me 1000, I owe her 500, so she sends me ~500" — and
  a single transfer moves. The ritual's fixed "she gives you 32%, you pay full"
  never happens on those weeks.
- He wants to track **only his own money**, not her expenses. So the app can
  never see her purchases, and therefore **cannot compute a true two-way
  balance**. A one-sided "she owes you" is the most it can honestly know.
- What he actually wants to _see_ is a **journal of money events**, colour-coded:
  what he spent, what he paid a card, when he sent his partner money he owed, and
  when a card payment used her money.

## Decision

Replace the settlement ritual with a **personal money-movement journal** built on
spec 0003's three-layer separation. **Slice 2.6 is renamed "money movements."**

### 1. Two numbers, never conflated

- **"What I really spent"** — consumption. `Σ actualExpenditure` (your share) of
  logged expenses, per category. The budget / 50-25-25 number. (Relabels the
  feed's "My share".)
- **Money out** — cash that left your account: card payments (your own money) +
  transfers you sent your partner. The bank-reconciliation number.

Transfers to the partner land in **Money out**, never in the per-category budget:
a transfer isn't consumption and has no category. Consequence, accepted
explicitly: because her purchases are never logged, "What I really spent"
**undercounts** true cost whenever she pays for shared things and only the net is
settled. That is the deliberate price of not tracking her ledger.

### 2. Expenses record cost; movements record cash; neither edits the other

The `isShared` flag means **the cost is split 68/32** — it is _not_ a claim the
partner reimbursed. Settlement state lives entirely in the movement layer. An
expense is **never** edited to reflect who paid or whether it settled (that would
corrupt the settlement-proof "what I really spent" number). This is the law of
the codebase, straight from spec 0003 §2.

### 3. Movement types surfaced in 2.6

Uses the shipped `Movement` model. One additive column:
`Movement.fundedByPartner Boolean @default(false)`.

| UI action               | `Movement`                                                    | Feed colour            |
| ----------------------- | ------------------------------------------------------------- | ---------------------- |
| Card payment            | `type=card_payment`, `cardId` set, optional `fundedByPartner` | **blue** (`--payment`) |
| I paid {partner}        | `type=gf_paid`                                                | **amber**              |
| _(Savings — unchanged)_ | (an expense)                                                  | green                  |
| _(Expense — unchanged)_ | (an expense)                                                  | neutral                |

**Money the partner sends is not its own entry.** In this user's flow her cash
passes straight through to a card payment, so it's captured as a
`fundedByPartner` toggle on the card payment — one movement, one line, tagged
"{partner}'s money". This also gives the user the visual distinction he asked for
between "a card payment with her money" and "a card payment with mine", and lets
the reminder (below) draw down without a second log. `gf_received` / `income` /
`other` stay in the schema but ship no UI here.

### 4. "Partner owes you" — a soft, one-sided reminder

`= Σ(partner's 32% share of this month's shared expenses) − Σ(fundedByPartner
card payments this month)`. Her share per expense is `amount − actualExpenditure`.
Labelled an estimate ("her share of shared expenses, minus what she's covered"),
**not** a settled balance — it reads high on netting weeks until the offsetting
"I paid {partner}" is logged, and that's fine. No auto two-way netting: the user
nets in his head and logs the transfer (spec 0003 §7, "no auto-settlement").

### 5. Entry point + rendering

- `+ Add` opens a **type picker** (Expense / Card payment / I paid {partner}) →
  the matching form. The **"Paid by" (You/Girlfriend) control is removed** from
  the expense form — every expense is the user's; `paidBy` defaults to `"you"`
  and stays in the schema (reversible, no migration).
- Movements render **interleaved with expenses by date** in both feeds
  (dashboard `MonthFeed`, expenses `ExpenseListInteractive`), colour-tagged.
- Feed footer gains a **"Paid to {partner}"** line; \*\*Total = what I really spent
    - set aside + paid to partner\*\*.

## Consequences

- One additive migration (`fundedByPartner`); `Movement` has no shipped data, so
  it's safe. `paidBy` becomes effectively constant `"you"` but is retained.
- The two feeds now consume a **union feed item** (expense | movement), sorted by
  date — a new shared type, not two parallel lists.
- Per-card outstanding balance (spec 0003 §4.4) is **deferred** to a follow-up —
  a true balance wants cumulative/all-time framing; 2.6 stays month-framed and
  focused on the journal + the two numbers.
- Deferred items are logged, not silently dropped (per repo review lens).
