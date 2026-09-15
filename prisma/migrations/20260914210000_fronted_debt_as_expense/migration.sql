-- Spec 0007 §6a — a debt the partner fronted becomes a categorised Expense.
--
-- Three steps, all idempotent so a re-run (or a replay on a preview branch) is a
-- no-op rather than a duplicate:
--   1. the marker column,
--   2. the subcategory rename, in place and by row identity,
--   3. the conversion of existing `gf_fronted` movements into fronted expenses.

-- 1. The marker. Explicitly NOT `paidBy` (deprecated, dropped from every read).
ALTER TABLE "Expense"
    ADD COLUMN IF NOT EXISTS "isFronted" BOOLEAN NOT NULL DEFAULT false;

-- 2. "Purchases made by girlfriend" → "Covered for me". The row is the user's
-- share, not her purchase, and the old name is partner-specific besides.
--
-- This UPDATES THE EXISTING ROW rather than seeding a new one. The seed matches
-- subcategories BY NAME, so renaming the starter kit alone would make the next
-- provision find no "Covered for me" and CREATE one, leaving the old row (and
-- every expense on it) orphaned under the old name — a duplicate, not a rename.
-- The NOT EXISTS guard covers the account that somehow already has the new name:
-- renaming into it would create the very duplicate this step exists to avoid.
UPDATE "Subcategory" s
SET "name" = 'Covered for me',
    "updatedAt" = NOW()
WHERE s."name" = 'Purchases made by girlfriend'
  AND NOT EXISTS (
      SELECT 1
      FROM "Subcategory" d
      WHERE d."userId" = s."userId"
        AND d."categoryId" = s."categoryId"
        AND d."name" = 'Covered for me'
  );

-- 3. Convert `gf_fronted` movements into fronted expenses.
--
-- The expense KEEPS THE MOVEMENT'S id and `createdAt`. `createdAt` is what
-- settlement-cycle membership compares (spec 0007 §3.5), so every converted row
-- stays in the exact cycle it was already filed under and no closed cycle's
-- balance moves. Keeping the id makes the conversion traceable and makes the
-- INSERT collide with itself on a re-run, which `ON CONFLICT DO NOTHING` absorbs.
--
-- The amount was always the user's own share ("whatever I owe her"), so it maps
-- straight to `amount` AND `actualExpenditure` with `isShared` false — no split
-- is applied and no partner share is derived.
--
-- The INNER JOIN on the category is deliberate: an account with no
-- `combined-expenses` category has nowhere honest to put the row, so its
-- movements are left untouched and settlement keeps summing them.
INSERT INTO "Expense" (
    "id", "userId", "categoryId", "subcategoryId", "cardId", "date",
    "description", "amount", "isShared", "yourPercentage", "actualExpenditure",
    "paidBy", "isRecurring", "isFronted", "notes", "createdAt", "updatedAt"
)
SELECT
    m."id",
    m."userId",
    c."id",
    sub."id",
    NULL,
    m."date",
    COALESCE(
        NULLIF(BTRIM(m."note"), ''),
        'I owe ' || COALESCE(NULLIF(BTRIM(st."partnerName"), ''), 'my partner')
    ),
    m."amount",
    false,
    1,
    m."amount",
    'you',
    false,
    true,
    NULL,
    m."createdAt",
    NOW()
FROM "Movement" m
JOIN "Category" c
    ON c."userId" = m."userId"
   AND c."slug" = 'combined-expenses'
LEFT JOIN "Subcategory" sub
    ON sub."userId" = m."userId"
   AND sub."categoryId" = c."id"
   AND sub."name" = 'Covered for me'
LEFT JOIN "Settings" st
    ON st."userId" = m."userId"
WHERE m."type" = 'gf_fronted'
ON CONFLICT ("id") DO NOTHING;

-- Drop only the movements that actually became an expense. Anything left behind
-- (no `combined-expenses` category) still moves the settlement balance, so no
-- debt is lost. A `gf_fronted` row can never be a cycle marker — the CHECK from
-- the settlement-cycle migration restricts `closedAt` to transfers — so no cycle
-- boundary is deleted here.
DELETE FROM "Movement" m
WHERE m."type" = 'gf_fronted'
  AND EXISTS (
      SELECT 1
      FROM "Expense" e
      WHERE e."id" = m."id"
        AND e."isFronted" = true
  );
