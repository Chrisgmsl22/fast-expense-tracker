-- Spec 0007 §6b: the PAYMENT is the expense, not the debt.
--
-- Slice E made a debt she fronted an Expense{isFronted}. One day of use showed
-- the question was wrong — a debt is provisional, and can be reduced or
-- cancelled by something she owes you before any money moves. So the debt goes
-- back to being settlement-only, and the payment that settles it becomes the
-- expense.
--
-- LOCAL ONLY, one way, no guards — this database holds test data (Christian,
-- 2026-09-16). A production run is a separate, deliberate step under spec 0005
-- §6 and must not reuse this file as-is: see the hand-back for what it needs.

-- 1 & 2. Debts return to the movement table, then the marker is renamed to match
--    its new meaning. Both steps are conditional on the OLD column still being
--    there, so the integration test can replay this file against an
--    already-migrated schema and still exercise step 3.
--
--    An `isFronted` row carries HIS SHARE in `amount`, which is exactly what a
--    gf_fronted movement records. The id is reused so a converted pair stays
--    recognisable.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'Expense' AND column_name = 'isFronted'
    ) THEN
        INSERT INTO "Movement" ("id", "userId", "date", "amount", "type", "note", "cardId", "createdAt", "updatedAt")
        SELECT e."id", e."userId", e."date", e."amount", 'gf_fronted', e."description", NULL, e."createdAt", NOW()
        FROM "Expense" e
        WHERE e."isFronted" = true;

        DELETE FROM "Expense" WHERE "isFronted" = true;
    END IF;

    -- Renaming and converting are guarded separately: a replay against a schema
    -- that already has BOTH columns (another test re-applies the superseded
    -- slice-E migration) must still drain the old column without trying to
    -- rename onto a name that is taken.
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'Expense' AND column_name = 'isFronted'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'Expense' AND column_name = 'isPartnerPayment'
    ) THEN
        ALTER TABLE "Expense" RENAME COLUMN "isFronted" TO "isPartnerPayment";
    END IF;
END $$;

-- 3. Payments become expenses, filed under combined-expenses → "Covered for me"
--    (the subcategory kept its name through the reversal: it always described
--    the payment better than it described the debt). No split is applied — the
--    amount sent IS the expenditure.
INSERT INTO "Expense" (
    "id", "userId", "categoryId", "subcategoryId", "cardId", "date",
    "description", "amount", "isShared", "yourPercentage", "actualExpenditure",
    "paidBy", "isPartnerPayment", "isRecurring", "notes", "createdAt", "updatedAt"
)
SELECT
    m."id",
    m."userId",
    c."id",
    (SELECT s."id" FROM "Subcategory" s
      WHERE s."categoryId" = c."id" AND s."name" = 'Covered for me' LIMIT 1),
    NULL,
    m."date",
    COALESCE(NULLIF(TRIM(m."note"), ''), 'Payment to partner'),
    m."amount",
    false,
    1.0,
    m."amount",
    'you',
    true,
    false,
    NULL,
    m."createdAt",
    NOW()
FROM "Movement" m
JOIN "Category" c
  ON c."userId" = m."userId" AND c."slug" = 'combined-expenses'
WHERE m."type" = 'gf_paid'
  -- A marker carries the cycle boundary and `Expense` has no `closedAt`, so
  -- converting one would DELETE a closed cycle: its rows would fall back into
  -- the open cycle and the balance would move. A marker stays a movement until
  -- the boundary has a home on both tables (see the hand-back).
  AND m."closedAt" IS NULL;

-- Only the ones that found a home are removed; anything left keeps counting in
-- the settlement balance through the legacy `gf_paid` read.
DELETE FROM "Movement" m
WHERE m."type" = 'gf_paid'
  -- Belt and braces: a marker was never inserted above, so it cannot match the
  -- EXISTS either. Stating it twice means a future edit to the INSERT cannot
  -- quietly turn this into a cycle-deleting statement.
  AND m."closedAt" IS NULL
  AND EXISTS (SELECT 1 FROM "Expense" e WHERE e."id" = m."id");
