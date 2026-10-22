-- BUG-10: convert card colours still stored as colour names to hex.
--
-- The first seed (commit 1d6da1d) wrote "Card"."color" as names: gray, yellow,
-- purple, blue, green. Card colours later became #RRGGBB hexes, and the card
-- edit schema accepts only that shape, so editing a card that still holds a
-- name fails validation.
--
-- Source of truth for every hex below: lib/palette.ts -> CARD_PALETTE (the five
-- seeded swatches) and CASH_COLOR. The values are copied here as literals on
-- purpose: a migration must keep applying the same values forever, even if the
-- palette later changes. tests/unit/card-color-migration.test.ts fails if the
-- two ever drift.
--
-- Safety properties:
--   * Matches a name case-insensitively, so 'Blue' and 'BLUE' convert too. A row
--     already holding a hex never equals a name, so it is never touched.
--   * Idempotent: after the first run no row holds a name, so a second run
--     updates 0 rows.
--   * Touches "Card"."color" and nothing else. Not a re-seed: the seed matches
--     cards by NAME and rewrites their color and type (see the BUG-2 migration).

UPDATE "Card" SET "color" = '#6b7280' WHERE lower("color") = 'gray';
UPDATE "Card" SET "color" = '#ca8a04' WHERE lower("color") = 'yellow';
UPDATE "Card" SET "color" = '#9333ea' WHERE lower("color") = 'purple';
UPDATE "Card" SET "color" = '#2563eb' WHERE lower("color") = 'blue';
UPDATE "Card" SET "color" = '#16a34a' WHERE lower("color") = 'green';
