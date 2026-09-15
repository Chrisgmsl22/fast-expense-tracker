-- Spec 0007 §6a — a debt the partner fronted becomes a categorised Expense.
--
-- SCHEMA ONLY. `vercel.json` runs `prisma migrate deploy` on every production
-- build, so no data statement belongs in a migration that merges without an
-- explicit gate. This file only adds the marker column so the deployed code
-- finds "isFronted" where it expects it (it is renamed to "isPartnerPayment"
-- by a later migration).
--
-- The subcategory rename ("Purchases made by girlfriend" → "Covered for
-- me") and the conversion of existing `gf_fronted` movements into fronted
-- expenses are deferred to a second, deliberate PR — see
-- fet-payment-is-the-expense/deferred-data-migration.sql in the harness task
-- log for the exact statements and the reasoning for holding them back.

-- The marker. Explicitly NOT "paidBy" (deprecated, dropped from every read).
ALTER TABLE "Expense"
    ADD COLUMN IF NOT EXISTS "isFronted" BOOLEAN NOT NULL DEFAULT false;
