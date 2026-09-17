# Execution plan — after the money rework

**Written 2026-09-17**, after PR #74 (settlement cycles, the payment-is-the-expense
inversion) and PR #73 (funding source) both landed on `main`.

This is the **sequencing** document: which open items run together, in which
order, and why. The items themselves live in
[`chores.json`](./chores.json) and [`bugs.json`](./bugs.json) — this file does
not repeat them, it says how they are grouped.

Delete this file once the three tiers are done. It describes one push, not a
standing process.

---

## The one rule that shapes everything

**No two tiers may touch the same file.** Two branches editing
`app/(dashboard)/dashboard/page.tsx` is how the last merge cost 28 conflicts and
three defects that neither branch had alone. The grouping below is chosen for
file isolation first and topic second.

| Tier | Runs in                         | Owns                                                    |
| ---- | ------------------------------- | ------------------------------------------------------- |
| 1    | the primary checkout, on `main` | the settlement service, its repositories, the migration |
| 2    | worktree `fet-t2`               | auth config, one settlement component, two repositories |
| 3    | worktree                        | the dashboard and expenses pages, and the chin          |

---

## Tier 1 — CHORE-12, the only blocker

**The one item where the app fails at something the owner actually does, and the
only one that rewrites production rows.**

Two halves that cannot be separated:

1. **`Expense.closedAt`** — a cycle squared by _paying_ the partner cannot be
   closed. `closedAt` lives only on `Movement`, and after the inversion the
   payment is an `Expense`, so there is no row to mark. The close option does
   not even appear.
2. **The data conversion** — legacy `gf_fronted` and `gf_paid` rows into the new
   model, plus the subcategory rename and the cents backfill.

They ship together because a `gf_paid` row carrying `closedAt` has nowhere to put
its marker until half 1 lands.

### Rollout, and why it is different from everything else here

`vercel.json` runs `prisma migrate deploy` on every production build, so
**merging this IS the migration**. It gets a read-only production survey and a
**Neon restore point** before the merge, both run by the owner.

### Three traps, written out because each has already been paid for once

- **The conversion MUST reuse the movement's id.** `withoutConvertedTwins`,
  `computeFeedTotals`'s twin filter and ADR-0024 all assume it, and nothing
  enforces it. New ids double every transfer.
- **Rename the subcategory rows by id first**, then flip
  `PARTNER_PAYMENT_SUBCATEGORY_NAME` and `prisma/seed.ts` together. The seed
  matches by name, so a half-done rename creates a duplicate on the next re-seed.
- **`Expense.closedAt` lands before the conversion**, not beside it.

Source material is outside the repo, at
`~/.claude/harness/tasks/fet-payment-is-the-expense/` — `plan.md`, the 206-line
`deferred-data-migration.sql`, and two preserved test files.

---

## Tier 2 — the quick wins

One PR. None of it touches money logic, and no two items share a file.

| Item                     | What                                                                                                 |
| ------------------------ | ---------------------------------------------------------------------------------------------------- |
| **BUG-3**                | Session never expires — set `maxAge` and `updateAge`                                                 |
| **BUG-6**                | A future month labelled "a past month", and the open-settlement tab vanishing on any other month     |
| **CHORE-16** (code half) | The duplicated close-set query, the untested `updateTransfer` guard, the serial `await` in `getById` |

**CHORE-16's other half is not a PR.** Deleting stale branches and worktrees is a
git operation with no diff. Done as an operation on 2026-09-17: nine worktrees
down to two, thirty-three branches down to nine.

---

## Tier 3 — the chin

One PR, one worktree. **CHORE-13 belongs here, not in Tier 2** — it edits the
same two pages as CHORE-14, and splitting them across parallel branches
guarantees the conflict this plan exists to avoid.

| Item         | What                                                                          |
| ------------ | ----------------------------------------------------------------------------- |
| **CHORE-13** | One shared month chooser that survives navigation                             |
| **CHORE-14** | The breakdown modal, from `docs/designs-screens/Summary breakdown modal.html` |
| **CHORE-19** | The unsettled-balance reminder on the Expenses chin                           |
| **CHORE-18** | Savings-funded spend on the dashboard — _after_ 14 defines the breakdown      |

### The decision that unblocked it

**2026-09-17, option A: the chin's income total is GROSS.** The design showed
`card spend from income + paid to partner from income − what she paid you`. That
last term is wrong, and not only on the ledger rule: `What I really spent` is
already the owner's share alone — verified on September, where
`36,046.51 − 11,700.00 − 4,895.69 = 19,450.82` — so the partner's share was never
in it, and subtracting her reimbursement removes money that was already excluded.

The net-with-partner figure belongs on the **Settlement** page, where cash in and
cash out are meant to meet.

---

## Deferred, deliberately

| Item                                                                  | Why                                                                                    |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **CHORE-17** — 108 files to the comment bar                           | `scripts/check-comment-size.sh` stops new ones. Hygiene, not value                     |
| **CHORE-8.e** — onboarding wizard                                     | Pointless before signup exists                                                         |
| **BUG-4** — the cross-user category leak                              | Harmless with one user, but **blocks CHORE-8.d**. Do it before signup, not before this |
| **BUG-7** — the edit dialog retyping a payment's category and funding | Reachable only through the edit dialog; no figure is wrong today                       |
| **CHORE-15** — the narrowed predicate and the stale-tab edit reads    | Unreachable through the app                                                            |
| **PR #67** — CHORE-8.b                                                | Open since 28 July. Parked by decision, not forgotten                                  |

---

## What still has no owner

**The known gap closes with CHORE-12, and nothing else on this board makes the
app wrong.** After the three tiers, the next real question is whether the signup
track (CHORE-8.c / 8.d / 8.e) is wanted at all, and BUG-4 is its gate.
