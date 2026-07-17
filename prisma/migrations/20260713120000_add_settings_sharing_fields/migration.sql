-- CHORE-6.a / ADR-0021: partner identity + opt-in shared-expense mode become
-- per-user Settings, replacing the hardcoded PARTNER_NAME constant.
--
-- Both columns are additive: `sharesExpenses` defaults to false (Solo — the new
-- default mode) so every existing row is unaffected structurally, and
-- `partnerName` is nullable. The owner account is switched to Shared with its
-- partner name via a SEPARATE, manually-run data migration after deploy (see
-- docs/operations/owner-shared-mode-migration.md) — it is NOT part of this file.
ALTER TABLE "Settings" ADD COLUMN     "sharesExpenses" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "partnerName" TEXT;
