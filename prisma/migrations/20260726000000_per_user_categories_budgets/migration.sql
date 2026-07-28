-- Per-user categories, subcategories, and budgets (ADR-0022).
--
-- Expand → guard → backfill → contract, so existing global rows are re-homed to
-- the owner account instead of being dropped:
--   1. Add `userId` as NULLABLE on Category / Subcategory / CategoryBudget.
--   2. Guard: abort unless the database is single-user (the only state in which
--      "re-home every global row to the owner" is unambiguous — i.e. before
--      public signup). This fails LOUD (transactional rollback) instead of
--      silently mis-homing data if the precondition is ever violated.
--   3. Backfill `userId` = the owner (the sole User) on every row.
--   4. Enforce NOT NULL + add the FK + the new per-user unique constraints.
--
-- On a fresh/empty database (e.g. the integration-test DB) there are no rows to
-- backfill, so the guard is skipped, the UPDATEs touch zero rows, and every step
-- is a no-op-safe DDL change. On single-owner prod, all 13 categories + their
-- subcategories + any budget overrides re-home to the owner.
-- No Expense / Movement / Card / Income rows change — they already carry userId.

-- 1. Add nullable userId columns ------------------------------------------------
ALTER TABLE "Category" ADD COLUMN "userId" TEXT;
ALTER TABLE "Subcategory" ADD COLUMN "userId" TEXT;
ALTER TABLE "CategoryBudget" ADD COLUMN "userId" TEXT;

-- 2. Guard: single-user precondition --------------------------------------------
-- Re-homing every global row to "the owner" is only unambiguous when exactly one
-- user exists (the state before public signup, CHORE-8.d). If category rows exist
-- to backfill but the user count is not 1, ABORT — a rollback with a clear error
-- beats silently assigning all financial category data to the wrong account.
-- A fresh/empty DB (no rows) skips the guard so the DDL still applies cleanly.
-- See docs/operations/per-user-categories-migration.md.
DO $$
DECLARE
  has_rows boolean;
  user_count integer;
BEGIN
  SELECT
    EXISTS (SELECT 1 FROM "Category")
    OR EXISTS (SELECT 1 FROM "Subcategory")
    OR EXISTS (SELECT 1 FROM "CategoryBudget")
  INTO has_rows;
  SELECT count(*) INTO user_count FROM "User";

  IF has_rows AND user_count <> 1 THEN
    RAISE EXCEPTION
      'per-user categories backfill aborted: expected exactly 1 user when category rows exist, found %. Resolve extra users or hand-assign ownership before migrating.',
      user_count;
  END IF;
END $$;

-- 3. Backfill userId = owner (the sole User) ------------------------------------
-- Guarded above to be the single owner; earliest createdAt is a stable, env-free
-- tiebreak that is moot given the single-user precondition.
UPDATE "Category"
SET "userId" = (SELECT "id" FROM "User" ORDER BY "createdAt" ASC, "id" ASC LIMIT 1)
WHERE "userId" IS NULL;

UPDATE "Subcategory"
SET "userId" = (SELECT "id" FROM "User" ORDER BY "createdAt" ASC, "id" ASC LIMIT 1)
WHERE "userId" IS NULL;

UPDATE "CategoryBudget"
SET "userId" = (SELECT "id" FROM "User" ORDER BY "createdAt" ASC, "id" ASC LIMIT 1)
WHERE "userId" IS NULL;

-- 4. Contract: NOT NULL + FKs + per-user uniqueness -----------------------------
ALTER TABLE "Category" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Subcategory" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "CategoryBudget" ALTER COLUMN "userId" SET NOT NULL;

-- Slug is per-user now, not global.
DROP INDEX "Category_slug_key";
CREATE UNIQUE INDEX "Category_userId_slug_key" ON "Category"("userId", "slug");

-- Budget override key gains userId.
DROP INDEX "CategoryBudget_categoryId_month_key";
CREATE UNIQUE INDEX "CategoryBudget_userId_categoryId_month_key" ON "CategoryBudget"("userId", "categoryId", "month");

ALTER TABLE "Category" ADD CONSTRAINT "Category_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Subcategory" ADD CONSTRAINT "Subcategory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CategoryBudget" ADD CONSTRAINT "CategoryBudget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
