-- Settlement-cycle marker on Expense (spec 0007 §3.5), mirroring the column
-- `20260914183000_add_settlement_cycle_marker` added to Movement. After the
-- spec 0007 §6b inversion a payment to the partner is an Expense, so a cycle
-- squared by paying her holds no movement to mark; this column gives that cycle
-- its boundary. Every marker read is the union of the two columns.
--
-- SCHEMA ONLY. `vercel.json` runs `prisma migrate deploy` on every production
-- build, so no data statement belongs here. Additive and nullable: every
-- existing expense is unmarked and no cycle boundary moves.
ALTER TABLE "Expense" ADD COLUMN "closedAt" TIMESTAMP(3);

-- Only a payment to the partner can close a cycle, the twin of the Movement
-- CHECK that allows the marker on a transfer alone. It backs the application
-- guard on both create and update, so no path can mark an ordinary purchase.
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_closedAt_isPartnerPayment_check"
    CHECK ("closedAt" IS NULL OR "isPartnerPayment");

-- Serves the marker scan that derives the cycle boundaries.
CREATE INDEX "Expense_userId_closedAt_idx" ON "Expense"("userId", "closedAt");
