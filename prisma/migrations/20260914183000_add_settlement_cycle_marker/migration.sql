-- Settlement-cycle marker (spec 0007 §3.5). Additive and nullable, so every
-- existing movement is unmarked and the whole history reads as one open cycle
-- until the first explicit close. Non-null carries the close INSTANT, which is
-- the cycle boundary itself.
ALTER TABLE "Movement" ADD COLUMN "closedAt" TIMESTAMP(3);

-- Only a transfer can close a cycle. The CHECK backs the application guard on
-- both create and update, so no path can mark a card payment or a debt.
ALTER TABLE "Movement" ADD CONSTRAINT "Movement_closedAt_type_check"
    CHECK ("closedAt" IS NULL OR "type" IN ('gf_paid', 'gf_received'));

-- Serves the marker scan that derives the cycle boundaries.
CREATE INDEX "Movement_userId_closedAt_idx" ON "Movement"("userId", "closedAt");
