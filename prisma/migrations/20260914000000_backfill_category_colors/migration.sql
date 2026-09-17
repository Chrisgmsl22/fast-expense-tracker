-- BUG-2: repair category colors that were never given a per-slug hex.
--
-- 20260624033219_add_category_color added "Category"."color" with the schema
-- default '#6b7280' and backfilled every existing row with that gray. The only
-- writer of the real per-slug hexes is the seed (prisma/seed.ts ->
-- CATEGORY_COLORS), and the seed has never run against production. So the
-- category dots and the "Where the money went" bars render gray there.
--
-- Source of truth for every hex below: prisma/seed.ts -> CATEGORY_COLORS.
-- The values are copied here as literals on purpose: a migration must keep
-- applying the same values forever, even if the TypeScript map later changes.
-- tests/unit/category-color-migration.test.ts fails if the two ever drift, or
-- if a new slug is added to the seed and missed here.
--
-- Safety properties:
--   * Only rows still holding the gray default '#6b7280' are updated. A row
--     whose color differs was chosen deliberately, so it is never touched and a
--     future user-chosen color survives this migration.
--   * Idempotent: after the first run no matching gray row is left for these
--     slugs, so a second run updates 0 rows.
--   * Scoped by "slug" only, never by "userId": every user still holding the
--     default gray is repaired. That is safe because per-user category recolor
--     does not ship until CHORE-8.c, so no user-chosen value can exist yet.
--   * Touches "Category"."color" and nothing else. No other table, and in
--     particular no "Card" row. That is why this is a migration and not
--     `pnpm db:seed:prod`: the seed also upserts cards, and it matches them by
--     NAME -- prisma/seed.ts:301-321 does findFirst({ name }), then either
--     update({ color, type }) or create. So a re-seed rewrites every card's
--     color/type, and any card the owner renamed in Settings is not found and
--     gets re-created as a duplicate.
--
-- The 'unassigned' sentinel is deliberately absent below. Its authoritative
-- color in the seed IS '#6b7280' (gray), so it needs no repair; writing a new
-- value for it would change intended design, not fix a bug.

UPDATE "Category" SET "color" = '#4f46e5' WHERE "slug" = 'housing'            AND "color" = '#6b7280';
UPDATE "Category" SET "color" = '#65a30d' WHERE "slug" = 'groceries'          AND "color" = '#6b7280';
UPDATE "Category" SET "color" = '#db2777' WHERE "slug" = 'charity'            AND "color" = '#6b7280';
UPDATE "Category" SET "color" = '#7c3aed' WHERE "slug" = 'transport'          AND "color" = '#6b7280';
UPDATE "Category" SET "color" = '#0891b2' WHERE "slug" = 'insurance'          AND "color" = '#6b7280';
UPDATE "Category" SET "color" = '#0d9488' WHERE "slug" = 'savings'            AND "color" = '#6b7280';
UPDATE "Category" SET "color" = '#2563eb' WHERE "slug" = 'services'           AND "color" = '#6b7280';
UPDATE "Category" SET "color" = '#e11d48' WHERE "slug" = 'health'             AND "color" = '#6b7280';
UPDATE "Category" SET "color" = '#d97706' WHERE "slug" = 'combined-expenses'  AND "color" = '#6b7280';
UPDATE "Category" SET "color" = '#0ea5e9' WHERE "slug" = 'personal'           AND "color" = '#6b7280';
UPDATE "Category" SET "color" = '#b91c1c' WHERE "slug" = 'debt'               AND "color" = '#6b7280';
UPDATE "Category" SET "color" = '#c026d3' WHERE "slug" = 'disposable-income'  AND "color" = '#6b7280';
