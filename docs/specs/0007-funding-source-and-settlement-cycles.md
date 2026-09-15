# 0007 — Funding source and settlement cycles

**Date**: 2026-09-14
**Status**: Draft — design agreed in session; every open question now decided
**Type**: Domain / money model
**Builds on**: [spec 0005](./0005-cash-basis-money-model.md), [ADR-0020](../decisions/0020-cash-basis-money-model.md)
**Amends**: the settlement window from [ADR-0019](../decisions/0019-two-sided-couple-balance.md); refines [ADR-0018](../decisions/0018-money-movements-not-settlement-ritual.md) §5 (feed rendering)
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

This **upholds** [ADR-0020](../decisions/0020-cash-basis-money-model.md) §4 and
refines [ADR-0018](../decisions/0018-money-movements-not-settlement-ritual.md) §5.

An earlier draft of this spec claimed it amended ADR-0020 §4 because transfers
were "invisible to the expenses view". That was wrong on both counts. §4 says
transfers are cash rather than budget expenses, carrying an optional note and
never a category — it says nothing about visibility, and a partner payment here
stays uncategorised and outside the budget, so §4 is upheld. ADR-0018 §5 already
had movements rendering interleaved by date in **both** feeds, the expenses list
included. What is new is the dedicated section and highlight, which is a
refinement of that rendering, not a reversal of anything.

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

## 6. Reimbursement timing — decided

**A reimbursement lands in the month of the expense, not the month the refund
arrives.** Medicine bought in March and refunded in April is neutralised in
**March**. Confirmed by the user, 2026-09-14.

The reason follows from §2: the budget says what **this month's income** funded,
and March's income ultimately funded nothing here. Dating it April would leave
March overstating spending and April understating it, so neither month would be
true.

The accepted cost: marking an expense reimbursed **restates a month that has
already closed**. In practice the card is paid off the moment the refund lands,
so the two months are usually the same and the restatement rarely happens.

Implementation consequence: any cached or precomputed monthly figure must be
invalidated when `fundedFrom` changes, including for a past month. A slice that
adds month caching later must not assume a closed month is immutable.

## 6a. Amendment — consumption and cash, told apart

**Added 2026-09-14 after hands-on use. Reverses §3.4's "the debt stays
settlement-only" and replaces ADR-0018 §5's single `Total`.**

### The problem, in his own numbers

Queried from the live local database for September:

| Figure                            | Amount    |
| --------------------------------- | --------- |
| My own expenses, my share         | $1,325.99 |
| What she fronted (debts I logged) | $1,950.00 |
| What I transferred to her         | $8,011.20 |

More of his consumption ran through her than through his own cards, and **none of
it reached a bucket**. The budget understated the month by 60%. July, which looks
more like ordinary use, understated by 4%. His verdict: _"I want it to reach my
budget because it is real money from my current month that I actually spent."_

Meanwhile the feed footer adds `1,325.99 + 8,011.20 = 9,337.19` and calls it
`Total` — a figure true in neither ledger, because it mixes what he consumed with
what left his account.

### The rule

**Two ledgers, one question each. They are never added together, and no screen
may show a figure that sums across them.**

| Ledger                              | Question                          | Contents                                                       |
| ----------------------------------- | --------------------------------- | -------------------------------------------------------------- |
| **Consumption** — drives 50/25/25   | What did this month's income buy? | my share of my own expenses **+ my share of what she fronted** |
| **Cash out** — reconciles to a bank | What left my account?             | card payments + transfers to her + cash expenses               |

Both exclude anything funded from savings or reimbursed.

The same pesos appear in both at different moments — she fronts the food
(consumption), he transfers the money later (cash). That is correct and is not a
double count, **because the two are never summed**. The UI must make that
impossible rather than merely discouraged: no `Total` spanning both.

### Decisions

> **Decision 1 was REVERSED on 2026-09-16, after use.** The debt was the expense;
> now the **payment** is. What follows is the current model; the superseded one
> and the reason are recorded in §6b. Everything else in §6a stands: the two
> ledgers, the "never summed" rule, the `combined-expenses` home, the "Covered
> for me" subcategory, and the spend-by-card exclusion.

1. **The payment you send her is the Expense. The debt she fronted is settlement
   only.** He logged a carwash she paid at **$500** — her outlay — while he owed
   about **$380**, because the form asked for a purchase he had not made. His
   correction: _"I do not want to add whatever she covered for me, I only want to
   log the expenses I made, in this case, paying her my portion (380ish not
   500)… when I make a payment, maybe we can turn that into the actual expense."_

    So:

    | Thing                  | Where it lives                                           | Budget  |
    | ---------------------- | -------------------------------------------------------- | ------- |
    | A debt she fronted     | Settlement only — not an expense, not in the feed        | no      |
    | A payment you send her | An **Expense** in `combined-expenses` → "Covered for me" | **yes** |

    The settlement balance still needs both sides — debts on one, payments on the
    other. Only **where each lives** changed.

    **A debt records what HE OWES, never what she paid.** That much is unchanged
    from the reversed decision, and the form must ask in those words: the $500
    entry happened because the question was ambiguous.

    **`combined-expenses` is still the home**, for the same reasons: it exists,
    it is already marked relevant, and he already uses it. He can change it per
    entry.

    **Rename its subcategory "Purchases made by girlfriend" → "Covered for
    me".** Chosen by Christian, 2026-09-14. His objection to the old name: _"its
    not really a purchase she did, Im only paying her a portion, my portion, so
    i dont want to confuse things."_ He is right — the row is his share, not her
    purchase, so the old name describes the wrong event.

    "Covered for me" is short like its siblings (Rent, Cats), says nothing about
    who paid, and centres his share rather than her transaction. It is also
    **partner-neutral**, where the seeded name says "girlfriend" — wrong for any
    other account now the partner is configurable (CHORE-6.a).

    **The rename is a trap.** It touches the frozen reference
    (`docs/reference/domain-reference.md` row 9), the starter kit, and existing
    rows in dev and production. The seed matches subcategories **by name**, so
    renaming without migrating existing rows **creates a duplicate** instead of
    renaming — the hazard CHORE-10 exists to fix, already visible in the dev
    database as phantom cards. Migrate by id, never by name, and verify no
    duplicate appears after a re-provision.

2. **The payment carries a funding source like any other purchase** (§3.1).
   Paying her from savings tags the **payment**, which is now the expense. The
   debt carries nothing: it is not consumption and never reaches a bucket.
3. **A debt never appears in the chronological feed.** His words: _"adding my
   debts to her adds too much noise. There's the settlement page for that."_
   Under the reversed model it also leaves the buckets and the category
   rollups — the settlement page is its only home. The **payment** is the feed
   row, because it is both the cash event and, now, the expense.

    Its yellow highlight follows it: the tone that marked a transfer row stays
    with the payment in its new life as an expense row.

4. **One payment, counted once per ledger.** The payment is the expense, so both
   ledgers see it — but by the same row, not two:

    | Ledger                | Counts the $380 payment as |
    | --------------------- | -------------------------- |
    | Consumption (buckets) | the **expense**, $380      |
    | Cash ("really spent") | the **same expense**, $380 |

    There is no second row to reconcile and no exclusion to remember, which is
    the main practical gain of the reversal. A debt contributes to neither
    ledger; it only moves the settlement balance.

5. **Transfers gain the funding-source control.** §3.1 already says they carry
   it; this makes the UI explicit. A payment made from savings leaves both
   ledgers for the month.

### The trap — read this before writing code

**Do not reintroduce `paidBy: "gf"`.** That column is deprecated and every read
has dropped it. Whatever marks a payment-expense must be new and explicit, and
the settlement layer must still read it as the "you paid her" side of the
balance.

BUG-1 — a card-less debt surfacing as a phantom `Cash` row in spend-by-card —
is why ADR-0020 §1 pulled debts out of the expense table in the first place.
Under the reversed model a debt is not an expense at all, so the hazard is gone
by construction; a payment-expense has a real card or is genuinely cash. Keep
the spend-by-card exclusion for as long as any legacy `isFronted` row can still
be read, and only then retire it.

## 6b. The reversal of decision 1

**2026-09-16.** §6a decision 1 made a debt she fronted an expense in the budget.
One day of real use showed the question it asks is the wrong one: he logged a
carwash at **$500**, her outlay, when his share was about **$380**.

> _"I do not want to add whatever she covered for me, I only want to log the
> expenses I made, in this case, paying her my portion (380ish not 500)… when I
> make a payment, maybe we can turn that into the actual expense."_

### Why a debt cannot be an expense — the argument that settles it

The objection raised against the reversal was netting: some months net to
nothing, so the consumption a transfer stood in for would vanish. He turned that
argument around, and his version is the stronger one:

> _"When I log something I owe to Brenda, I do not want this expense to be filled
> in immediately, remember there could be a case where I also owe her, in this
> case my amount could be reduced or removed. Instead, do not add an expense when
> I log that I owe Brenda, lets do this when I actually log a payment I make to
> her, this is more accurate and real based on how we settled."_

**Netting is precisely why a debt must not be an expense.** A debt is
_provisional_: something she owes you can reduce or cancel it before any money
moves, so booking it as spending records a purchase that may never happen. The
payment is the only part that is certain, because it has already happened.

> _"The tag for the money I owe her is still valid for the settlement tab, but
> the expenses should only contain what I actually sent her, when I make the
> log."_

The practical dividend: under §6a a debt-expense and its settling transfer had to
be kept out of each other's ledger by hand, and that was the most error-prone
rule in this document. One row now means one figure, and there is no exclusion
anyone can forget.

What changed, exactly:

| Concern             | §6a (superseded)                   | Current                      |
| ------------------- | ---------------------------------- | ---------------------------- |
| The expense         | The debt she fronted               | **The payment you send her** |
| The debt            | Categorised consumption, in budget | **Settlement only**          |
| Reconciling the two | Exclude the fronted row from cash  | Nothing to exclude           |

What survived the reversal, unchanged: the two-ledger rule, `combined-expenses`
as the home, the "Covered for me" subcategory rename (it describes the payment
better than it described the debt), and the principle that a debt records **what
he owes**, never her outlay.

### Slices

| Slice | Scope                                                                                               |
| ----- | --------------------------------------------------------------------------------------------------- |
| E     | ~~Debt becomes consumption~~ — **landed, then reversed by E′**                                      |
| E′    | Invert: payment becomes the expense, debt returns to settlement-only, migrate the rows — **landed** |
| F     | Feed rework: debts out, `Total` removed, "what I really spent" becomes cash out                     |
| G     | Funding source on payments (the deferred half of slice C)                                           |
| H     | Closed-settlement summary footer: total unsplit spend, what each owed, how it ended                 |

E′ before F. G and H are independent.

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
  the undercount this spec fixes; §5's interleaved feed rendering is refined into
  a dedicated section here
- [ADR-0019](../decisions/0019-two-sided-couple-balance.md) — its settlement
  window is replaced by the open cycle (§3.5)
- [ADR-0020](../decisions/0020-cash-basis-money-model.md) — §1, §4 and §6 all
  upheld. Nothing in it is amended.
