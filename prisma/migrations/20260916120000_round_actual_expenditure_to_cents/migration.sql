-- Money is stored to the cent (spec 0007 §6a). `actualExpenditure` was written
-- as the raw product of amount × yourPercentage, so rows carry values like
-- 816.0000000000001. A sub-cent remainder cannot be displayed, so every panel
-- rounded for itself — and the same expense read $383.99 in one view and
-- $384.00 in another, depending on which other rows shared its total.
--
-- `computeActualExpenditure` now rounds at write time. This brings existing rows
-- to the same rule so history is consistent with anything logged from now on.
-- Read-modify-write of one column, no row is added or removed.
UPDATE "Expense"
SET "actualExpenditure" = ROUND("actualExpenditure"::numeric, 2)
WHERE "actualExpenditure" <> ROUND("actualExpenditure"::numeric, 2);
