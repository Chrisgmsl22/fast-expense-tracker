# Per-user categories migration (CHORE-8.a) — PROD runbook

Manual, human-run verification steps for taking the per-user-categories change
(ADR-0022) to production. **The agent does not run these against prod.** They
mirror the careful-real-data discipline of the cash-basis money-model migration
(`docs/specs/0005-cash-basis-money-model.md`): survey with the Neon MCP before
and after, and only proceed once the pre-flight assumption is confirmed.

## What the structural migration does

The Prisma migration `20260726000000_per_user_categories_budgets` is applied to
prod the usual way (`pnpm db:migrate:deploy`, i.e. `prisma migrate deploy`). It
is self-contained: it adds the columns, guards the precondition, backfills, and
enforces the new constraints **in one transaction**, using the
expand → guard → backfill → contract pattern so no existing row is dropped:

1. **Expand** — add `userId` as a **nullable** `TEXT` column to `Category`,
   `Subcategory`, and `CategoryBudget`.
2. **Guard** — if any category/subcategory/budget row exists to backfill, assert
   the database has **exactly one user**; otherwise `RAISE EXCEPTION` and roll the
   whole migration back. This makes the "re-home every row to the owner" step
   fail **loudly** rather than silently mis-home data if prod is ever not
   single-user. An empty DB (no rows) skips the guard so fresh DBs still migrate.
3. **Backfill** — set `userId` on every existing row to the **owner** (the sole
   `User`, guaranteed single by step 2):

    ```sql
    UPDATE "Category"
    SET "userId" = (SELECT "id" FROM "User" ORDER BY "createdAt" ASC, "id" ASC LIMIT 1)
    WHERE "userId" IS NULL;
    -- identical UPDATEs for "Subcategory" and "CategoryBudget"
    ```

4. **Contract** — `SET NOT NULL` on all three columns; drop the global
   `Category_slug_key` and add `Category_userId_slug_key`; drop
   `CategoryBudget_categoryId_month_key` and add
   `CategoryBudget_userId_categoryId_month_key`; add the three `userId` foreign
   keys to `User`.

No `Expense`, `Movement`, `Card`, `Income`, or `Settings` rows change — they
already carry `userId`. The exact SQL lives in
`prisma/migrations/20260726000000_per_user_categories_budgets/migration.sql`.

## Why a runbook if the migration self-guards and self-backfills

The migration now **enforces** the single-user precondition itself (step 2): on a
multi-user database it aborts with a clear error and rolls back, so it physically
cannot silently mis-home data. On this single-owner prod that guard passes and the
backfill assigns every row to the owner automatically.

The runbook is therefore **defense-in-depth + verification**, not the sole safety
net: survey to _confirm_ the single-owner precondition before deploy (so a failed
guard is never a surprise), capture baseline counts, and _verify_ the result
after. If the pre-flight ever shows more than one user, STOP and hand-assign
instead of relying on the guard to reject the deploy.

## 1. Pre-flight survey (read-only, Neon MCP) — REQUIRED before deploy

Confirm the owner is the earliest user and capture baseline counts:

```sql
-- Owner lookup + earliest-user check: these two ids MUST match.
SELECT "id", "email", "createdAt" FROM "User" ORDER BY "createdAt" ASC;
--   Expect a single row (the owner). If more than one row exists, verify the
--   FIRST row is the owner account before continuing. If it is not, DO NOT
--   deploy — the backfill would assign data to the wrong user.

-- Baseline row counts to compare against after deploy.
SELECT
  (SELECT count(*) FROM "Category")       AS categories,
  (SELECT count(*) FROM "Subcategory")    AS subcategories,
  (SELECT count(*) FROM "CategoryBudget") AS budgets;
```

Record the owner `id` (call it `<OWNER_USER_ID>`) and the three counts.

## 2. Deploy the migration — happens automatically on merge

**There is no manual step here.** `vercel.json` runs migrations as part of every
production build:

```jsonc
"buildCommand": "prisma generate && if [ \"$VERCEL_ENV\" = \"production\" ]; then prisma migrate deploy; fi && next build"
```

So merging to `main` triggers a production deploy, which applies any pending
migration **before** `next build` — the schema lands before the new code serves
traffic, which is the correct order. The migration itself is atomic: if any step
fails (including the single-user guard), it rolls back, the build fails, and prod
stays on the old schema **and** the old code.

Run `pnpm db:migrate:deploy` by hand only to recover from a failed or skipped
deploy; on an already-migrated database it is a no-op ("No pending migrations").

Because the apply is automatic, do the pre-flight survey (§1) **before merging**,
not after — once the PR lands, the migration is already on its way.

## 3. Post-deploy verification (read-only, Neon MCP) — REQUIRED

```sql
-- (a) No orphans: every row has a userId, and it is the owner's.
SELECT
  (SELECT count(*) FROM "Category"       WHERE "userId" IS NULL) AS cat_null,
  (SELECT count(*) FROM "Subcategory"    WHERE "userId" IS NULL) AS sub_null,
  (SELECT count(*) FROM "CategoryBudget" WHERE "userId" IS NULL) AS bud_null;
--   All three MUST be 0.

SELECT count(DISTINCT "userId") AS distinct_owners FROM "Category";
--   MUST be 1.

SELECT count(*) AS not_owner FROM "Category"
WHERE "userId" <> '<OWNER_USER_ID>';
--   MUST be 0 (repeat for "Subcategory" and "CategoryBudget" if desired).

-- (b) Counts unchanged from the pre-flight survey.
SELECT
  (SELECT count(*) FROM "Category")       AS categories,
  (SELECT count(*) FROM "Subcategory")    AS subcategories,
  (SELECT count(*) FROM "CategoryBudget") AS budgets;

-- (c) Constraints installed as expected.
SELECT indexname FROM pg_indexes
WHERE tablename IN ('Category', 'CategoryBudget')
  AND indexname IN ('Category_userId_slug_key', 'CategoryBudget_userId_categoryId_month_key');
--   Both index names MUST be present; the old
--   Category_slug_key / CategoryBudget_categoryId_month_key MUST be gone.
```

Then confirm in the app: the owner's dashboard category grid, "Where the money
went", and the category-detail screens render exactly as before, and inline
budget editing still saves. Nothing should look different — the owner's data was
re-homed to the owner.

## Outcome — applied 2026-07-28

Applied to prod automatically by the deploy for PR #65 (`_prisma_migrations`:
`20260726000000_per_user_categories_budgets`, finished `2026-07-28T02:28:51Z`,
no rollback). Post-deploy verification passed on every check:

| Check                                 | Required | Actual |
| ------------------------------------- | -------- | ------ |
| `Category.userId` NULL                | 0        | 0      |
| `Subcategory.userId` NULL             | 0        | 0      |
| `CategoryBudget.userId` NULL          | 0        | 0      |
| distinct owners in `Category`         | 1        | 1      |
| rows not owned by the owner           | 0        | 0      |
| expenses linked to another's category | 0        | 0      |

Counts unchanged from the pre-flight baseline: **13 categories / 59
subcategories / 0 budget overrides** (39 expenses). Both new indexes
(`Category_userId_slug_key`, `CategoryBudget_userId_categoryId_month_key`) are
present and both old global ones are gone.

## Rollback

The migration is a single transaction, so a failed apply leaves prod untouched.
If a problem surfaces _after_ a successful apply, the safe recovery is a
forward-fix migration (drop the per-user unique + `userId` columns, restore the
global `slug` unique) rather than an in-place downgrade — but this should not be
needed on single-owner prod where the backfill is deterministic.

## Notes

- The owner seed (`prisma/seed.ts`) now creates the owner **first**, then stamps
  their `userId` on every seeded category/subcategory, so a fresh prod (or a
  re-seed) is already per-user. This runbook only concerns migrating the
  **existing** global rows already in prod.
- New per-account provisioning (a fresh user getting their own default set) is
  CHORE-8.b, not this slice.
