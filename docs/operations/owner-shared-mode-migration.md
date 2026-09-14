# Owner shared-mode migration (CHORE-6.a) + BUG-2 rider

Manual, human-run prod data steps for CHORE-6.a. **The agent does not run these.**
Run them **after** the structural migration
`20260713120000_add_settings_sharing_fields` is deployed (`prisma migrate deploy`),
verifying real data via the Neon MCP before and after.

Why manual: these touch real Neon data. The structural migration (additive
columns, safe) ships in the PR; these data changes are the owner's call.

## 1. Owner account → Shared mode (required)

The new `sharesExpenses` column defaults to `false`, so on deploy the owner's
existing `Settings` row flips to **Solo**. Restore Shared mode with the owner's
partner name. Idempotent upsert keyed on the unique `userId`:

```sql
-- Replace <OWNER_USER_ID> with the owner's User.id (look it up by email via Neon MCP).
INSERT INTO "Settings" ("id", "userId", "sharesExpenses", "partnerName", "updatedAt")
VALUES (gen_random_uuid()::text, '<OWNER_USER_ID>', true, 'Brenda', now())
ON CONFLICT ("userId") DO UPDATE
SET "sharesExpenses" = true,
    "partnerName"    = 'Brenda',
    "updatedAt"      = now();
```

`defaultSharePercentage` already holds 0.68 on the owner's row and is untouched.
No expense / movement / card rows change. New accounts stay Solo by default.

Verify after: the owner's dashboard/settlement render with "Brenda", and the
Settings "I share expenses" toggle shows on with the name + 68% prefilled.

## 2. BUG-2 rider — category colors (now automatic) + drop the retired Amex Gold card

See `docs/roadmap/bugs.json` → BUG-2. Data-only, no app code. 2a needs no manual
step any more; 2b is still a human decision on this prod trip.

### 2a. Category colors — **no manual step. Handled by a migration.**

Prod `Category.color` rows still hold the schema default `#6b7280` (gray). The
fix ships as a data migration:

    prisma/migrations/20260914000000_backfill_category_colors/migration.sql

`vercel.json` runs `prisma migrate deploy` on every production build, so the
backfill applies on merge. Nothing to run by hand, and no production credentials
are needed. The migration sets the per-slug hex only on rows still holding the
gray default, is idempotent, and touches `Category.color` and nothing else.
Verify afterwards that the dashboard category dots + "Where the money went" bars
render in color.

> **Do not use `pnpm db:seed:prod` for this.** An earlier revision of this
> section said to re-seed production. That is retracted. The seed also upserts
> `Card` rows, and it matches them **by name**: `prisma/seed.ts:301-321` does
> `findFirst({ name })`, then either `update({ color, type })` or `create`. So a
> re-seed rewrites every card's `color`/`type`, and any card the owner **renamed**
> in Settings is not found and is **re-created as a duplicate**. The owner has
> edited cards since CHORE-6.c shipped, so a re-seed would damage real data to
> fix a color.

### 2b. FK-safe delete of the retired "Amex Gold" card

The owner no longer holds an Amex Gold card. Delete it **only if** it has no
referencing rows (Prisma `onDelete: Restrict` would block a delete otherwise, but
check explicitly to avoid orphaning history):

```sql
-- Look up the card id first (scope to the owner):
--   SELECT id FROM "Card" WHERE "userId" = '<OWNER_USER_ID>' AND name = 'Amex Gold';

-- Confirm it is unreferenced before deleting:
SELECT
  (SELECT count(*) FROM "Expense"  WHERE "cardId" = '<AMEX_GOLD_CARD_ID>') AS expense_refs,
  (SELECT count(*) FROM "Movement" WHERE "cardId" = '<AMEX_GOLD_CARD_ID>') AS movement_refs;

-- If BOTH counts are 0, delete:
DELETE FROM "Card" WHERE id = '<AMEX_GOLD_CARD_ID>';
```

If either count is non-zero, do **not** delete — the card is attached to history.
Card soft-archive (CHORE-6.c) is the right tool for an in-use card; leave the
delete until then.

## Notes

- Note the seed's find-then-create for cards means re-seeding will **re-create**
  an "Amex Gold" card (it's in `CARD_SEED`). If you delete it in 2b, also remove
  it from `CARD_SEED` in `prisma/seed.ts` first (or the next `db:seed:prod` brings
  it back). Coordinate 2b with a seed edit, or defer 2b to CHORE-6.c's card
  management. Decide at run time.
