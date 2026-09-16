-- Spec 0007 §6b: the PAYMENT is the expense, not the debt.
--
-- SCHEMA ONLY. `vercel.json` runs `prisma migrate deploy` on every production
-- build, so no data statement belongs in a migration that merges without an
-- explicit gate. This file only renames the marker column so the deployed
-- code finds "isPartnerPayment" where it expects it, naming its final
-- meaning: a payment that settles a debt is itself the expense.
--
-- The data conversion that used to live here — reversing `isFronted`
-- expenses back into `gf_fronted` movements, and turning `gf_paid` movements
-- into payment-expenses — is deferred to a second, deliberate PR, so that a
-- production data rewrite is reviewed and released on its own. Until it runs,
-- every read that counts payments counts the unconverted `gf_paid` movements
-- too (the settlement balance and the feed footer both do).
DO $$
BEGIN
    -- Guarded so a replay against a schema that already has BOTH columns
    -- (another test re-applies the superseded slice-E migration) is a no-op
    -- rather than an error.
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
