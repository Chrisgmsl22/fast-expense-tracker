# Partner-payment conversion (CHORE-12) — PROD runbook

Read-only survey for taking `20260916230000_convert_partner_payments` to
production. **The agent never runs any of this against prod, and never opens a
production connection.** Christian runs it himself.

**Every statement below is a `SELECT`. There is no write in this file.**

`vercel.json` runs `prisma migrate deploy` on every production build, so
**merging the PR IS the migration**. Survey first, take the restore point, then
merge.

## What the migration does

Three steps, one transaction. Full reasoning is in the migration file's header.

1. Renames the `Subcategory` row `"Purchases made by girlfriend"` →
   `"Covered for me"`. It **finds the row by name** — a migration has no id to
   match on, since every account's row carries its own — **scoped to that
   account's `combined-expenses` category**, and then updates that row **in
   place**. No new row, so every expense keeps the `subcategoryId` it points at.
   `PARTNER_PAYMENT_SUBCATEGORY_NAME` and `prisma/seed.ts` flip in the same
   commit.
2. Converts every `Movement{type:"gf_paid"}` into the
   `Expense{isPartnerPayment}` it already is under ADR-0024. The expense keeps
   the movement's **id**, `createdAt`, `date`, amount, note, `fundedFrom` and
   cycle marker; the movement is then deleted.
3. Rounds `Expense.actualExpenditure` to the cent.

The migration compares the per-user settlement balance before and after step 2
and **aborts the whole transaction** if any user's balance moved by half a cent
or more.

## Why step 3 needs the restore point

Steps 1 and 2 are reversible by hand — every field survives the move. **Step 3
is not.** Rounding discards the sub-cent fraction permanently and shifts monthly
totals by cents. Take a **Neon restore point** before merging.

## 1. Pre-flight survey (read-only) — REQUIRED before merging

### (a) What will convert, and what will not — record this

Record **`will_convert`** and **`stays_a_movement`**; §3 compares both against
their pre-flight values.

```sql
SELECT
  count(*) FILTER (
    WHERE EXISTS (SELECT 1 FROM "Category" c
                   WHERE c."userId" = m."userId"
                     AND c."slug" = 'combined-expenses')
  ) AS will_convert,
  count(*) FILTER (
    WHERE NOT EXISTS (SELECT 1 FROM "Category" c
                       WHERE c."userId" = m."userId"
                         AND c."slug" = 'combined-expenses')
  ) AS stays_a_movement,
  count(*) FILTER (WHERE m."closedAt" IS NOT NULL) AS carries_a_marker,
  count(*) FILTER (WHERE m."fundedFrom" <> 'income') AS savings_funded,
  count(*) FILTER (
    WHERE EXISTS (SELECT 1 FROM "Category" c
                   WHERE c."userId" = m."userId"
                     AND c."slug" = 'combined-expenses')
      AND NOT EXISTS (
        SELECT 1 FROM "Subcategory" s
        JOIN "Category" c ON c."id" = s."categoryId"
        WHERE s."userId" = m."userId"
          AND c."userId" = m."userId"
          AND c."slug" = 'combined-expenses'
          AND s."name" IN ('Covered for me', 'Purchases made by girlfriend'))
  ) AS lands_without_subcategory
FROM "Movement" m
WHERE m."type" = 'gf_paid';
```

`stays_a_movement` should be **0**. Anything above zero is an account with no
`combined-expenses` category; those payments are left alone and settlement keeps
counting them through the legacy read, so no money is lost — but note the number.

`lands_without_subcategory` should be **0** too. Anything above zero converts
into an expense with `subcategoryId = NULL`: the account's `combined-expenses`
category holds neither name, so step 1 has nothing to rename and step 2 finds
nothing to file under. **This is not a failure** — the expense is correct, the
money is right, and the category page rolls it up under "Other" — so the
migration only raises a `WARNING` and carries on. File those rows by hand
afterwards, or add the subcategory before merging and the count drops to zero.

### (b) The subcategory rename

```sql
SELECT s."userId", s."name", count(e."id") AS expenses_attached
FROM "Subcategory" s
LEFT JOIN "Expense" e ON e."subcategoryId" = s."id"
WHERE s."name" IN ('Purchases made by girlfriend', 'Covered for me')
  AND s."categoryId" IN (
      SELECT c."id"
      FROM "Category" c
      WHERE c."userId" = s."userId"
        AND c."slug" = 'combined-expenses'
  )
GROUP BY s."userId", s."name"
ORDER BY s."userId", s."name";
```

The `categoryId` scope is step 1's own — the rename matches by name **only inside
the account's `combined-expenses` category**, and its `NOT EXISTS` guard looks
for `Covered for me` in that same `categoryId`. A same-named row filed under any
other category does not appear here, and the migration leaves it alone.

Expect **one row per account**, named `Purchases made by girlfriend`. If an
account shows **both** names, both sit in its one `combined-expenses` category
(`Category` is unique on `userId, slug`), so the rename refuses that row rather
than creating a duplicate — merge the two subcategories by hand first, or accept
that the old row keeps its name. An account showing only `Covered for me` is
already renamed and step 1 skips it; an account with no row at all is the
`lands_without_subcategory` case from **(a)**.

### (c) The cents backfill — record how much money moves

Record **`total_shift`**; §3 turns it into the tolerance it allows **(f)** to
move by.

Step 3 rounds every `Expense.actualExpenditure`, **including the rows step 2 has
just written**: a payment-expense takes its `actualExpenditure` raw from
`Movement."amount"`, so a `gf_paid` amount with a sub-cent tail is rounded too.
The union below covers both, or the bound would miss money the migration itself
creates. A convertible row that turns out to collide on its id is never inserted
and never rounded, so counting it here only makes the bound wider.

```sql
WITH will_round AS (
  SELECT e."actualExpenditure"::numeric AS v
  FROM "Expense" e
  UNION ALL
  SELECT m."amount"::numeric
  FROM "Movement" m
  WHERE m."type" = 'gf_paid'
    AND EXISTS (SELECT 1 FROM "Category" c
                 WHERE c."userId" = m."userId"
                   AND c."slug" = 'combined-expenses')
)
SELECT
  count(*) AS rows_to_round,
  ROUND(SUM(v - ROUND(v, 2)), 6) AS net_shift,
  ROUND(SUM(abs(v - ROUND(v, 2))), 6) AS total_shift
FROM will_round
WHERE v <> ROUND(v, 2);
```

Both figures matter, and they answer different questions:

- **`total_shift`** — the magnitude. Every row's fraction, added regardless of
  direction. This is the money the step **discards permanently**, and the number
  to judge. A few cents is expected.
- **`net_shift`** — the same sum **signed**, so a row rounded up cancels a row
  rounded down. It is what the monthly totals move by on net, and it can read
  near zero while `total_shift` is large. Never read it alone.

If `total_shift` is more than a few cents, stop and re-read the migration before
merging.

### (d) The `isFronted` assertion

```sql
SELECT count(*) AS stray_columns
FROM information_schema.columns
WHERE table_schema = current_schema()
  AND table_name = 'Expense'
  AND column_name = 'isFronted';
```

MUST be **0**. `20260916210000_payment_is_the_expense` renamed the column to
`isPartnerPayment`. If it is 1, the migration counts the rows carrying it and
aborts if any exist — do not merge until you know why the column is back.

### (e) The conversion baseline — record this

The exact expression the migration asserts on. Record every row; §3 below
compares against it.

**It measures the conversion alone, and it is blind to step 3 by
construction.** Every term rounds to the cent **before** it is summed, and
rounding is idempotent, so rounding `actualExpenditure` in step 3 cannot change
this number. That is deliberate — the backfill's whole purpose is to change a
stored value, so asserting it unchanged would be a contradiction. **A balance
summed the way the app sums one is not blind**, so run **(f)** as well.

```sql
SELECT
  u."id" AS user_id,
  u."email",
  ROUND(
        (SELECT COALESCE(SUM(ROUND(e."amount"::numeric, 2)
                           - ROUND(e."actualExpenditure"::numeric, 2)), 0)
           FROM "Expense" e
          WHERE e."userId" = u."id" AND NOT e."isPartnerPayment")
      - (SELECT COALESCE(SUM(ROUND(m."amount"::numeric, 2)), 0)
           FROM "Movement" m
          WHERE m."userId" = u."id" AND m."type" = 'gf_fronted')
      - (SELECT COALESCE(SUM(ROUND(m."amount"::numeric, 2)), 0)
           FROM "Movement" m
          WHERE m."userId" = u."id" AND m."type" = 'gf_received')
      + (SELECT COALESCE(SUM(ROUND(e."actualExpenditure"::numeric, 2)), 0)
           FROM "Expense" e
          WHERE e."userId" = u."id" AND e."isPartnerPayment")
      + (SELECT COALESCE(SUM(ROUND(m."amount"::numeric, 2)), 0)
           FROM "Movement" m
          WHERE m."userId" = u."id" AND m."type" = 'gf_paid'
            AND NOT EXISTS (SELECT 1 FROM "Expense" x
                             WHERE x."id" = m."id"
                               AND x."userId" = m."userId"
                               AND x."isPartnerPayment"))
  , 2) AS settlement_balance
FROM "User" u
ORDER BY u."email";
```

### (f) The LIFETIME balance, rounded the way the app rounds — record this too

**This is not the number on the Settlement screen, and it is not meant to be.**
The app scopes the balance to the **open cycle**: `getSettlement` calls
`getForCreatedRange(userId, openedAt, null)`, with `openedAt` taken from the newest
cycle marker (`lib/services/settlement/settlement.service.ts`). The query below has
no `createdAt` floor, so it sums **every row the account ever filed**. The two
agree only for an account that has never closed a cycle — and **(g)** counts
exactly the markers that make them disagree.

The floor is left out deliberately. A marker sits on a transfer **or** on a
payment-expense, so an honest floor would have to read `Expense."closedAt"` — and
that column does not exist on production until this PR's own
`20260916220000_add_expense_cycle_marker` creates it. Pre-flight cannot reference
it, and the before/after comparison in §3 only means something if the **same** SQL
runs on both sides.

What it is for: **(e)** rounds every term before summing, so it is blind to step 3
by construction. This one rounds **once, at the end** — the way `partnerShareTotal`
sums raw values and `computeCoupleBalance` rounds the result
(`lib/domain/movement.ts`, `lib/domain/settlement.ts`) — so it is the one figure
here that **sees** step 3. A row at `actualExpenditure = 680.004` moves it, and
enough such rows accumulate into cents. Same five terms as (e), inner rounding
removed.

```sql
SELECT
  u."id" AS user_id,
  u."email",
  ROUND(
        (SELECT COALESCE(SUM(e."amount"::numeric
                           - e."actualExpenditure"::numeric), 0)
           FROM "Expense" e
          WHERE e."userId" = u."id" AND NOT e."isPartnerPayment")
      - (SELECT COALESCE(SUM(m."amount"::numeric), 0)
           FROM "Movement" m
          WHERE m."userId" = u."id" AND m."type" = 'gf_fronted')
      - (SELECT COALESCE(SUM(m."amount"::numeric), 0)
           FROM "Movement" m
          WHERE m."userId" = u."id" AND m."type" = 'gf_received')
      + (SELECT COALESCE(SUM(e."actualExpenditure"::numeric), 0)
           FROM "Expense" e
          WHERE e."userId" = u."id" AND e."isPartnerPayment")
      + (SELECT COALESCE(SUM(m."amount"::numeric), 0)
           FROM "Movement" m
          WHERE m."userId" = u."id" AND m."type" = 'gf_paid'
            AND NOT EXISTS (SELECT 1 FROM "Expense" x
                             WHERE x."id" = m."id"
                               AND x."userId" = m."userId"
                               AND x."isPartnerPayment"))
  , 2) AS lifetime_balance
FROM "User" u
ORDER BY u."email";
```

This one **may move**, by up to (c)'s `total_shift` **rounded up to the next
cent, plus one cent** — §3 states the same bound and why the extra cent is
there. That is the backfill working, not a fault. (e) says the conversion moved nothing; (f) says how much the
rounding moved a figure computed the app's way.

**Write down what the Settlement screen shows as well, before you merge.** That is
the open-cycle figure, and it is the only pre-deploy record §3 can hold the screen
against.

### (g) Closed cycles — record the count

```sql
SELECT
  (SELECT count(*) FROM "Movement" WHERE "closedAt" IS NOT NULL) AS movement_markers,
  (SELECT count(*) FROM "Expense"  WHERE "closedAt" IS NOT NULL) AS expense_markers;
```

Their **sum** is what History renders. It must be identical after the migration —
markers move between the two columns, they never multiply.

Pre-flight, `Expense."closedAt"` does not exist yet — this PR's
`20260916220000_add_expense_cycle_marker` creates it — so Postgres rejects the
**whole query at parse time**: you get `ERROR: column "closedAt" does not exist`
and no row at all, not a row with a zero in it. Run the `Movement` term alone
before merging, and the whole query after. `movement_markers` on its own is
therefore the pre-flight sum §3 compares against.

## 2. Take the restore point, then merge

Take a **Neon restore point**. Then merge the PR; the production build runs
`prisma migrate deploy`.

If the balance assertion trips, the whole transaction rolls back, the build fails
and production stays exactly as it was.

## 3. Post-deploy verification (read-only) — REQUIRED

Re-run **(e)**, **(f)** and **(g)** above.

- Every `settlement_balance` from **(e)** MUST equal its pre-flight value **to
  the cent**. It proves the conversion moved no money between the tables. It
  says nothing about step 3 — it cannot; see (e).
- Every `lifetime_balance` from **(f)** answers the other question: how much did
  the backfill move a balance computed the app's way? It MAY differ from its
  pre-flight value, by no more than **(c)'s `total_shift` rounded up to the next
  cent, plus one cent** — a `total_shift` of 0.011 allows 0.03. The extra cent is
  not slack, so do not tidy it away: (f) applies `ROUND(..., 2)` to the **whole**
  sum, so two raw sums that differ by `total_shift` can land on cents one further
  apart than that. A larger move is a real divergence — investigate before
  trusting the number.
- `movement_markers + expense_markers` from **(g)** MUST equal the pre-flight sum.
- Re-run **(a)**: `stays_a_movement` MUST match its pre-flight value, and
  `will_convert` MUST have **dropped**. It normally reaches 0, but a correct run
  can leave it above 0 and that is not a failure on its own — `will_convert`
  counts every `gf_paid` row whose account has a `combined-expenses` category,
  including the ones the migration deliberately left alone. A remainder means an
  **id collision**: some `Expense` already holds that movement's id, so
  `ON CONFLICT ("id") DO NOTHING` skipped the insert and the `userId`-scoped
  `DELETE` kept the movement. Those rows stay movements **permanently** — a
  re-deploy will not clear them — and settlement keeps counting them through the
  legacy read, so no money is lost. Identify them with the query below, then
  decide per row: convert by hand under a fresh id, or leave it as a movement.
  A remainder that **equals the pre-flight `will_convert`** is different — nothing
  converted at all. Stop and read the build log before trusting any figure.

```sql
SELECT m."id", m."userId", m."amount", m."date", m."closedAt"
FROM "Movement" m
WHERE m."type" = 'gf_paid'
  AND EXISTS (SELECT 1 FROM "Category" c
               WHERE c."userId" = m."userId" AND c."slug" = 'combined-expenses')
ORDER BY m."userId", m."date";
```

Then confirm the count moved rather than vanished:

```sql
SELECT count(*) AS payment_expenses FROM "Expense" WHERE "isPartnerPayment";
```

Finally, in the app:

- **Settlement** — the balance is the **open cycle**, so it does not equal
  `lifetime_balance` from **(f)** unless **(g)** returned no markers at all.
  Compare it against the figure you wrote down before merging: it should read the
  same, give or take the cents step 3 rounded away.
- **Settlement → History** — the same number of closed cycles, no empty one.
- **Dashboard feed** — each payment to the partner appears **once**, gold, with
  no legacy transfer row beside it.
- **Category → Combined Expenses** — the subcategory reads "Covered for me".

## Rollback

The migration is one transaction, so a failed apply leaves production untouched.
After a successful apply, steps 1 and 2 could be undone by a forward-fix
migration — every field survived the move. **Step 3 cannot be undone by any
migration**; that is what the Neon restore point is for.
