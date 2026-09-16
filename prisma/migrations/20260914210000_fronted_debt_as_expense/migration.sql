-- The marker column for partner money on an Expense.
--
-- THE DIRECTION IN THE FILE NAME IS REVERSED. This migration was written for
-- spec 0007 §6a decision 1 — "a debt the partner fronted becomes a categorised
-- Expense" — which was built, used for a day, and REVERSED by §6b + ADR-0024.
-- The governing model is §6b: a debt is settlement-only, and the PAYMENT you
-- send the partner is the Expense. The directory name is frozen by Prisma's
-- checksum, so it still says "fronted_debt_as_expense"; only this comment can
-- say what is actually true.
--
-- The column survives the reversal because both models need one marker on
-- Expense. Only its meaning changed, which is why the later migration renames
-- it "isFronted" → "isPartnerPayment".
--
-- SCHEMA ONLY. `vercel.json` runs `prisma migrate deploy` on every production
-- build, so no data statement belongs in a migration that merges without an
-- explicit gate. This file only adds the marker column so the deployed code
-- finds "isFronted" where it expects it.
--
-- The subcategory rename ("Purchases made by girlfriend" → "Covered for
-- me") and the conversion of existing movements are deferred to a second,
-- deliberate PR (CHORE-12). Until that PR ships, the code reads the name live
-- databases actually hold (see PARTNER_PAYMENT_SUBCATEGORY_NAME) and counts the
-- unconverted movements, so nothing depends on data this file did not change.

-- The marker. Explicitly NOT "paidBy" (deprecated, dropped from every read).
ALTER TABLE "Expense"
    ADD COLUMN IF NOT EXISTS "isFronted" BOOLEAN NOT NULL DEFAULT false;
