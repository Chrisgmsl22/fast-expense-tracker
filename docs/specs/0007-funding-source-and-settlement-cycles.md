# 0007 — Funding source and settlement cycles

**Date**: 2026-09-14
**Status**: Draft — design agreed in session, awaiting review
**Type**: Domain / money model
**Builds on**: [spec 0005](./0005-cash-basis-money-model.md), [ADR-0020](../decisions/0020-cash-basis-money-model.md)
**Amends**: ADR-0020 §4 (transfers are invisible to the expenses view)
**Kicks off with**: an ADR for sign-off — `docs/decisions/` is protected

> Written from a design session on 2026-09-14, driven by real usage. A fresh
> session should be able to start the first slice from this document alone.

---

## 1. Problem

Three complaints, all the same root cause.

1. **"I bought shoes with money I had saved months ago, so I did not log them at
   all."** Logging them would eat this month's budget for money that was
   allocated in an earlier month. The purchase is simply missing.
2. **"I paid Brenda $700 and nothing in my expenses changed."** Cash left the
   account and the expenses view never showed it.
3. **"I paid for medicine, insurance refunded all of it, and the app still thinks
   I spent that money."**

The model stores cash movements and consumption, but it has no way to say **whose
money, from which month** funded an outflow. So it either counts an outflow fully
or not at all, and both are wrong for these three cases.

## 2. The governing principle

The three buckets answer one question: **how is _this month's income_ being
used?** Not "what did I consume", and not "what cash moved".

That single rule resolves cases that look contradictory:

| Event                             | This month's income used                                               | In the budget |
| --------------------------------- | ---------------------------------------------------------------------- | ------------- |
| Groceries on the NU card          | yes                                                                    | yes           |
| Shoes paid from savings           | no — an earlier month's income, already allocated as savings back then | no            |
| Medicine, fully reimbursed        | no — a third party paid                                                | no            |
| Your share of what Brenda fronted | yes, when you settle it from income                                    | yes           |

Counting a savings-funded purchase would **double-count**: once as savings in the
month it was set aside, again as spend in the month it was used.

## 3. Decisions

### 3.1 Every outflow carries a funding source

One field, three values, default `income`:

| Value        | Meaning                             | Budget  |
| ------------ | ----------------------------------- | ------- |
| `income`     | this month's income — the default   | counts  |
| `savings`    | money set aside in an earlier month | skipped |
| `reimbursed` | a third party paid it back          | skipped |

It applies to the two things that are outflows of the user's own money:

- **`Expense`** — a purchase.
- **`Movement{type:"gf_paid"}`** — money sent to the partner.

### 3.2 Never tag the card payment

A card payment stays untagged, upholding [ADR-0020 §6](../decisions/0020-cash-basis-money-model.md)
("card balance = charges − payments, source-agnostic. No source tagging, ever").

This matters because the user's habit is _buy on credit, pay the card off
immediately_. It is tempting to tag the payment, and it is wrong for two reasons:

1. One payment can settle many purchases, so a single tag cannot describe it
   honestly.
2. Source-tagging a payment is exactly the bug `fundedByPartner` was, removed in
   CHORE-3.

So the tag goes on the **purchase**. The card sees the charge and the payment as
it does today; only the budget changes.

**Worked example — $3,000 shoes on a credit card, paid off from savings:**

- Expense: $3,000, category Shopping, `fundedFrom: savings`.
- Budget: unchanged. No bucket moves.
- Card balance: +$3,000 charge, then −$3,000 payment. Untagged, as today.
- Expenses list: the row appears, badged "from savings".

### 3.3 `reimbursed` is restricted to the Health category

Reimbursement in practice means the health insurance refund. Restricting it keeps
the option out of every other expense form and prevents the value being used as a
catch-all.

- Enforced in validation, on create **and on edit** — changing a reimbursed
  expense's category away from Health must fail rather than silently strand the
  value.
- The category is `health` (`docs/reference/domain-reference.md` row 8).
- Loosening this later is a one-line change if a non-health refund ever appears.

**The refund itself is never income.** It is the user's own money returning.
Logging it as income would inflate the base the 50/25/25 divides, the same
mistake ADR-0020 §3 already refuses for the partner's money.

**Full refunds only.** A partial refund is out of scope — see §7.

### 3.4 Money paid to the partner appears in the Expenses view

Amends ADR-0020 §4, which kept transfers out of the expenses view entirely.

- A `gf_paid` movement shows in the Expenses screen in **its own section**, with
  its own highlight colour.
- It is **not** categorised and never enters the category buckets. A settlement
  transfer is a net residual covering several things at once; forcing one
  category onto it would be a lie.
- It respects its funding source: paying Brenda from savings does not consume
  this month's income.

The rejected alternative was to categorise the transfer as consumption. It breaks
on netting: some months the net runs the other way and there is no transfer at
all, so the consumption it was standing in for would vanish.

**The debt itself is unchanged.** `gf_fronted` stays settlement-only, exactly as
ADR-0020 §1 has it.

### 3.5 Settlement cycles

A settlement is a period that opens, accumulates, and closes.

- **Closing is confirmed, never automatic.** When a logged transfer brings the
  balance to zero, the app offers to close. The user confirms. A financial record
  is never closed on the app's initiative.
- **Closing settlement N opens settlement N+1 immediately.** There is no gap and
  no decision to make.
- **A late shared expense joins the _open_ settlement.** Closed stays closed. The
  money still nets out correctly overall; it simply sits in the next cycle.
  Reopening a closed settlement is deliberately not built — it doubles the
  complexity of every screen that reads a cycle.
- **Closed settlements are browsable**, each showing the rows it contained.

Three views, one visual style:

| View            | Shows                                                       |
| --------------- | ----------------------------------------------------------- |
| Month           | every shared expense and transfer in the calendar month     |
| Open settlement | everything since the last close — what is being settled now |
| History         | closed settlements, openable                                |

This replaces the current rolling current-plus-previous-month window, which
silently drops anything unsettled older than last month.

## 4. What changes in the code

- **Schema**: `Expense.fundedFrom` and `Movement.fundedFrom`, defaulting to
  `income`. A settlement-cycle marker — either a `closedAt`-style field on the
  closing movement or a small `SettlementCycle` table; decide at slice time.
- **Budget** (`lib/domain/dashboard.ts`): `computeBuckets` and the category reads
  count only `fundedFrom: "income"` rows. Filter at the data boundary so the
  bucket maths never sees an excluded row, rather than remembering to skip one.
- **Settlement** (`lib/services/settlement/settlement.service.ts`): the window
  becomes the open cycle rather than two calendar months. `buildSettlementRows`
  from PR #71 is already the single derivation both panels read, so the new views
  project from it too.
- **Expenses view**: a partner-payment section; funding-source badges on rows.
- **Validation** (`lib/schemas/`): the Health restriction on `reimbursed`.

## 5. Decomposition

| Slice | Scope                                                                | Depends on |
| ----- | -------------------------------------------------------------------- | ---------- |
| A     | `fundedFrom` on `Expense`, form control, budget exclusion, badges    | —          |
| B     | `reimbursed` value + Health restriction                              | A          |
| C     | `fundedFrom` on `gf_paid`; partner-payment section in Expenses       | A          |
| D     | Settlement cycles: marker, close flow, open-settlement view, history | —          |

A is the foundation. D is independent and by far the largest; it should be split
again at pickup.

## 6. Open question

**Which month does a reimbursement land in?** Medicine bought in March, refund
received in April.

- **Month of the expense (March).** March's true cost was zero, so March tells
  the truth. The cost is that a closed month's numbers change after the fact.
- **Month the refund arrives (April).** Nothing restates, but March overstates
  spending and April understates it.

Recommendation: **month of the expense**, because the budget's job is to say what
this month's income actually funded, and March's income funded nothing here. The
user usually pays the card off the moment the refund lands, so the two months are
normally the same and the question rarely bites.

## 7. Out of scope

- **Partial refunds.** `reimbursed` assumes the full amount. Storing a refunded
  amount is the obvious extension if a partial one ever appears.
- **A savings balance.** Explicitly rejected by the user: "that would add another
  place to keep track of, and it could drift." `fundedFrom: savings` records that
  savings funded a purchase; it does not track how much savings remain.
- **Reopening a closed settlement** (§3.5).
- **Card balance** — still CHORE-9, unchanged by this spec.

## 8. References

- [spec 0005](./0005-cash-basis-money-model.md) — the three ledgers this builds on
- [ADR-0018](../decisions/0018-money-movements-not-settlement-ritual.md) — records
  the undercount this spec fixes
- [ADR-0020](../decisions/0020-cash-basis-money-model.md) — §4 amended here, §1
  and §6 upheld
