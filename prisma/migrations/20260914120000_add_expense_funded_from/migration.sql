-- spec 0007 §3.1: an expense records which month's money funded it —
-- income | savings | reimbursed.
--
-- Purely additive. NOT NULL with a DEFAULT of 'income' means every existing row
-- becomes 'income', which is exactly today's behaviour: only 'income' rows
-- count toward the 50/25/25 budget, so no historical month's totals move.
-- No data migration is needed and none is run here.
ALTER TABLE "Expense" ADD COLUMN     "fundedFrom" TEXT NOT NULL DEFAULT 'income';
