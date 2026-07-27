-- Per-user categories, subcategories, and budgets (ADR-0022).
--
-- Expand → backfill → contract, so existing global rows are re-homed to the
-- owner account instead of being dropped:
--   1. Add `userId` as NULLABLE on Category / Subcategory / CategoryBudget.
--   2. Backfill `userId` = the owner (the earliest-created User) on every row.
--   3. Enforce NOT NULL + add the FK + the new per-user unique constraints.
--
-- On a fresh/empty database (e.g. the integration-test DB) the backfill UPDATEs
-- touch zero rows and every step is a no-op-safe DDL change. On dev, all 13
-- categories + their subcategories + any budget overrides re-home to the owner.
-- No Expense / Movement / Card / Income rows change — they already carry userId.

-- 1. Add nullable userId columns ------------------------------------------------
ALTER TABLE "Category" ADD COLUMN "userId" TEXT;
ALTER TABLE "Subcategory" ADD COLUMN "userId" TEXT;
ALTER TABLE "CategoryBudget" ADD COLUMN "userId" TEXT;

-- 2. Backfill userId = owner (earliest-created User) ----------------------------
-- The seeded owner is the only user in dev; the earliest createdAt is a stable,
-- env-free way to identify them inside a migration.
UPDATE "Category"
SET "userId" = (SELECT "id" FROM "User" ORDER BY "createdAt" ASC, "id" ASC LIMIT 1)
WHERE "userId" IS NULL;

UPDATE "Subcategory"
SET "userId" = (SELECT "id" FROM "User" ORDER BY "createdAt" ASC, "id" ASC LIMIT 1)
WHERE "userId" IS NULL;

UPDATE "CategoryBudget"
SET "userId" = (SELECT "id" FROM "User" ORDER BY "createdAt" ASC, "id" ASC LIMIT 1)
WHERE "userId" IS NULL;

-- 3. Contract: NOT NULL + FKs + per-user uniqueness -----------------------------
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
