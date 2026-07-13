-- CHORE-3 / ADR-0020: decouple partner money from card payments.
--
-- A "card payment funded by the partner" conflated two real events. Split each
-- existing funded card payment into an explicit `gf_received` transfer (the
-- money she sent you) while leaving the card payment itself as a plain payment.
-- This MUST run before the column is dropped — it reads `fundedByPartner`.
-- The settlement balance is preserved: the new `gf_received` draws the balance
-- down exactly as the funded flag used to.
INSERT INTO "Movement"
    (id, "userId", date, amount, type, "cardId", note, "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, "userId", date, amount, 'gf_received', NULL, note, now(), now()
FROM "Movement"
WHERE type = 'card_payment' AND "fundedByPartner" = true;

-- Drop the flag: money source is never tagged onto a card payment anymore.
ALTER TABLE "Movement" DROP COLUMN "fundedByPartner";
