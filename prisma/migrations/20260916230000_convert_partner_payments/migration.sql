-- CHORE-12 — the deferred DATA conversion for spec 0007 §6a/§6b and ADR-0024.
--
-- Every migration before this one in the §6a/§6b sequence was schema only:
-- `vercel.json` runs `prisma migrate deploy` on every production build, so
-- merging IS the migration and a data rewrite had to be reviewed on its own.
-- This is that review. It rewrites real financial rows and follows spec 0005 §6:
-- pre-flight counts, ONE transaction, idempotent, and a per-user
-- settlement-balance comparison across the conversion that must match to the
-- cent or the whole thing rolls back.
--
-- Three things happen, in this order, and the order is load-bearing:
--
--   1. "Purchases made by girlfriend" → "Covered for me". The statement MATCHES
--      BY NAME — a migration has no id to match on, since every account's row
--      carries its own — but it UPDATES THAT ROW IN PLACE, which is what spec
--      0007 §6a's "migrate by id, never by name" asks for: no second row, the
--      identity every expense points at survives. The match is scoped to the
--      account's `combined-expenses` category so a same-named row filed
--      anywhere else is left alone. Step 2 files converted payments under the
--      new name, so the rename must come first.
--   2. Every legacy `Movement{type:"gf_paid"}` becomes the
--      `Expense{isPartnerPayment}` it already is under ADR-0024, keeping its id,
--      its `createdAt`, its funding source and its cycle marker.
--   3. `Expense.actualExpenditure` is rounded to the cent.
--
-- ============================================================
-- DECISION — criterion 7 ("prefer additive") vs ADR-0024 ("delete the
-- movement in the same transaction that inserts the expense")
-- ============================================================
--
-- RESOLVED IN FAVOUR OF THE DELETE. Criterion 7 permits it on evidence that a
-- read path double-counts the converted movement, and one does:
--
--   `buildFeed` (lib/feed.ts) drops only `gf_fronted`. It has NO twin filter, so
--   a kept `gf_paid` movement renders a SECOND row beside its own payment-expense
--   in both surfaces that call it — the dashboard `MonthFeed` and the Expenses
--   list. Every $8,011 transfer would appear twice in "All activity".
--
-- The four money paths do dedup by id (`withoutConvertedTwins` in the settlement
-- service, three times; the `paymentExpenseIds` filter in `computeFeedTotals`),
-- so the TOTALS would survive. The lists would not. Adding a fifth twin filter
-- to `buildFeed` was the alternative; it was rejected because keeping the row
-- leaves a writable ghost — `updateTransfer` and `deleteMovement` both still
-- accept a `gf_paid` row, so editing the ghost would silently change nothing a
-- reader can see — and because every future read of `Movement` would inherit the
-- obligation to remember the filter. That is the defect class this codebase has
-- paid for six times: a predicate written narrower than the read path it mirrors.
--
-- The delete is not lossy. The expense keeps the movement's id, date, amount,
-- note, entry time, funding source and marker; nothing is discarded, the row
-- moves table. And the DELETE fires only where the converted expense provably
-- exists and provably carries the marker.
--
-- ============================================================
-- DECISION — criterion 8, the fronted direction
-- ============================================================
--
-- NEITHER FRONTED STATEMENT IS CARRIED, AND NOTHING IS DELETED FOR IT.
--
--   * `gf_fronted` → Expense is slice E, which was built, used for a day and
--     REVERSED (ADR-0024). A debt is provisional — something she owes him can
--     cancel it before money moves — so it is settlement-only, permanently.
--     Re-applying it would rebuild the model he rejected.
--   * Expense{isFronted} → `gf_fronted` was slice E's reversal. The deferred SQL
--     guards it on `information_schema` finding `Expense."isFronted"`. That guard
--     can never match: `20260916210000_payment_is_the_expense` RENAMED the column
--     to `isPartnerPayment`. And the set it targets was always empty — the commit
--     that wrote `isFronted: true` (64f6685) and the commit that removed the write
--     path (6db5daa) reached `main` in the SAME merge, PR #74 (4c478d6), so no
--     production build ever wrote one.
--
-- A guard that cannot fire reads as protection while doing nothing, so it is
-- replaced below by an assertion that STOPS the migration if the column is there
-- AND holds a row to reverse. Loud beats silent on real money. A bare leftover
-- column with no true row needs no reversal and is only noted: every database
-- that ran the chain had the column renamed by `20260916210000`, and nothing in
-- the repo replays the migration that created it, so a column found here came
-- from a database patched outside the chain.
--
-- ============================================================
-- Reversibility
-- ============================================================
--
-- Steps 1 and 2 are reversible by hand: the id, date, amount, note, entry time
-- and marker all survive, so an expense could be written back as a movement.
-- STEP 3 IS NOT. Rounding `actualExpenditure` DISCARDS THE SUB-CENT FRACTION
-- PERMANENTLY; no later statement can recover it. It shifts monthly totals by
-- cents, a figure the owner reads. Take the Neon restore point before merging.

-- ------------------------------------------------------------
-- 1. "Purchases made by girlfriend" → "Covered for me" (spec 0007 §6a).
--
-- The row is his share of a payment he sent, not a purchase she made, and the
-- old name is partner-specific besides. This UPDATES THE EXISTING ROW rather
-- than seeding a new one: the seed matches subcategories BY NAME, so renaming
-- the starter kit alone would make the next provision find no "Covered for me",
-- create one, and leave the old row — with every expense still attached — beside
-- it. That is a duplicate, not a rename. `PARTNER_PAYMENT_SUBCATEGORY_NAME` and
-- `prisma/seed.ts` flip in the same commit as this file, never separately.
--
-- WHICH ROW IT MATCHES: by name, and only inside the account's
-- `combined-expenses` category — the one home spec 0007 §6a gives the partner
-- payment. Without that scope the statement would rename a same-named row a user
-- filed under any other category, in any account. It is still an in-place UPDATE,
-- so no expense changes its `subcategoryId`.
--
-- The NOT EXISTS guard covers the account that somehow already holds the new
-- name: renaming into it would create the very duplicate this step avoids. It is
-- also what makes the statement idempotent — a replay finds no old-named row.
-- ------------------------------------------------------------
UPDATE "Subcategory" s
SET "name" = 'Covered for me',
    "updatedAt" = NOW()
WHERE s."name" = 'Purchases made by girlfriend'
  AND s."categoryId" IN (
      SELECT c."id"
      FROM "Category" c
      WHERE c."userId" = s."userId"
        AND c."slug" = 'combined-expenses'
  )
  AND NOT EXISTS (
      SELECT 1
      FROM "Subcategory" d
      WHERE d."userId" = s."userId"
        AND d."categoryId" = s."categoryId"
        AND d."name" = 'Covered for me'
  );

-- ------------------------------------------------------------
-- 2. `gf_paid` movements become payment-expenses, with the balance proved
--    unmoved either side of the conversion.
--
-- One DO block, not four statements, because the before/after balance snapshots
-- and the rows they bracket have to share one scope. The whole file is one
-- transaction under `prisma migrate deploy`, so a raise here rolls back step 1
-- as well.
-- ------------------------------------------------------------
DO $$
DECLARE
    -- The settlement balance, per user, over ALL rows — a transcription of
    -- `inputsFrom` + `withoutConvertedTwins` + `computeCoupleBalance`:
    --   + partner's share of your expenses  (amount − actualExpenditure)
    --   − what she fronted                  (gf_fronted)
    --   − what she sent you                 (gf_received)
    --   + what you sent her                 (payment-expenses + untwinned gf_paid)
    --
    -- Held as ONE string and executed twice, so the two snapshots cannot drift
    -- into different predicates — the failure shape this repo keeps meeting.
    --
    -- Every term rounds to the cent BEFORE summing. That is deliberate: step 3
    -- rounds `actualExpenditure`, and rounding is idempotent, so the snapshots
    -- are blind to step 3 and the assertion measures the conversion alone. It is
    -- not a check on the backfill — the backfill's whole purpose is to change a
    -- value, so asserting it unchanged would be a contradiction.
    --
    -- The twin subquery in the last term is scoped by `userId` for the same
    -- reason the DELETE below is: an id shared across accounts would otherwise
    -- drop this user's movement from BOTH snapshots identically, and the
    -- assertion would exit 0 on the very collision it exists to catch.
    balance_sql CONSTANT text := $balance$
        SELECT
            u."id" AS "userId",
            ROUND(
                  (SELECT COALESCE(SUM(ROUND(e."amount"::numeric, 2)
                                     - ROUND(e."actualExpenditure"::numeric, 2)), 0)
                     FROM "Expense" e
                    WHERE e."userId" = u."id" AND NOT e."isPartnerPayment")
                - (SELECT COALESCE(SUM(ROUND(m."amount"::numeric, 2)), 0)
                     FROM "Movement" m
                    WHERE m."userId" = u."id" AND m."type" = 'gf_fronted')
                - (SELECT COALESCE(SUM(ROUND(m."amount"::numeric, 2)), 0)
                     FROM "Movement" m
                    WHERE m."userId" = u."id" AND m."type" = 'gf_received')
                + (SELECT COALESCE(SUM(ROUND(e."actualExpenditure"::numeric, 2)), 0)
                     FROM "Expense" e
                    WHERE e."userId" = u."id" AND e."isPartnerPayment")
                + (SELECT COALESCE(SUM(ROUND(m."amount"::numeric, 2)), 0)
                     FROM "Movement" m
                    WHERE m."userId" = u."id" AND m."type" = 'gf_paid'
                      AND NOT EXISTS (SELECT 1 FROM "Expense" x
                                       WHERE x."id" = m."id"
                                         AND x."userId" = m."userId"
                                         AND x."isPartnerPayment"))
            , 2) AS "balance"
        FROM "User" u
    $balance$;
    stray_fronted bigint;
    to_convert  bigint;
    no_home     bigint;
    no_subcat   bigint;
    markers     bigint;
    inserted    bigint;
    removed     bigint;
    drift       record;
BEGIN
    -- Criterion 8: assert rather than guard. See the header. Dynamic SQL because
    -- the column normally does not exist, so a static reference would not parse.
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'Expense'
          AND column_name = 'isFronted'
    ) THEN
        EXECUTE 'SELECT count(*) FROM "Expense" WHERE "isFronted"'
           INTO stray_fronted;
        IF stray_fronted > 0 THEN
            RAISE EXCEPTION
                'CHORE-12: % Expense rows still carry "isFronted". Reversing '
                'them to gf_fronted movements is NOT in this migration — the '
                'set was provably empty when it was written. Survey first.',
                stray_fronted;
        END IF;
        RAISE NOTICE
            'CHORE-12: a vestigial Expense."isFronted" column is present and '
            'holds no rows. Nothing to reverse.';
    END IF;

    -- Pre-flight counts (spec 0005 §6). NOTICEs reach a psql session; a Vercel
    -- build log may swallow them, which is why docs/operations/ carries the same
    -- counts as read-only SQL for the owner to run BEFORE merging.
    SELECT count(*) INTO to_convert
      FROM "Movement" m
     WHERE m."type" = 'gf_paid'
       AND EXISTS (SELECT 1 FROM "Category" c
                    WHERE c."userId" = m."userId"
                      AND c."slug" = 'combined-expenses');
    SELECT count(*) INTO no_home
      FROM "Movement" m
     WHERE m."type" = 'gf_paid'
       AND NOT EXISTS (SELECT 1 FROM "Category" c
                        WHERE c."userId" = m."userId"
                          AND c."slug" = 'combined-expenses');
    SELECT count(*) INTO markers
      FROM "Movement" m
     WHERE m."type" = 'gf_paid' AND m."closedAt" IS NOT NULL;
    RAISE NOTICE
        'CHORE-12 pre-flight: % gf_paid to convert, % with no combined-expenses '
        'category (left as movements), % carrying a cycle marker.',
        to_convert, no_home, markers;

    -- The subcategory subquery in the INSERT below returns NULL rather than
    -- failing when the account's `combined-expenses` category holds no "Covered
    -- for me" — the owner renamed the row himself, or step 1 refused the rename
    -- because both names were already there. Counted AFTER step 1, so it sees
    -- the renamed row. Not fatal: a payment-expense with no subcategory is still
    -- a correct expense, and the category page rolls it up under "Other".
    -- Loud, though — silent is how a null gets found six months later.
    SELECT count(*) INTO no_subcat
      FROM "Movement" m
      JOIN "Category" c
        ON c."userId" = m."userId"
       AND c."slug" = 'combined-expenses'
     WHERE m."type" = 'gf_paid'
       AND NOT EXISTS (SELECT 1 FROM "Subcategory" s
                        WHERE s."userId" = m."userId"
                          AND s."categoryId" = c."id"
                          AND s."name" = 'Covered for me');
    IF no_subcat > 0 THEN
        RAISE WARNING
            'CHORE-12: % payment(s) will convert with NO subcategory — their '
            'combined-expenses category holds no "Covered for me" row. The '
            'expenses are correct; file them by hand afterwards.',
            no_subcat;
    END IF;

    CREATE TEMP TABLE _chore12_balance (
        "phase"  text,
        "userId" text,
        "balance" numeric
    );
    EXECUTE format(
        'INSERT INTO _chore12_balance SELECT %L, s."userId", s."balance" FROM (%s) s',
        'before', balance_sql);

    -- The conversion. The expense KEEPS THE MOVEMENT id — ADR-0024 makes that a
    -- hard requirement, and it is the only thing `withoutConvertedTwins` and
    -- `computeFeedTotals`' twin filter recognise a converted pair by. It also
    -- makes a re-run collide with itself, which ON CONFLICT absorbs.
    --
    -- `createdAt` survives because settlement-cycle membership compares it (spec
    -- 0007 §3.5): a converted row stays in the cycle it was already filed under,
    -- so no closed cycle's balance moves.
    --
    -- `fundedFrom` survives too. The deferred SQL predates the column and
    -- dropped it; without it a savings-funded transfer would convert into an
    -- income-funded expense and land in a budget it was never part of.
    --
    -- `closedAt` MOVES, it is not copied. The DELETE below takes the movement
    -- with it, so the boundary exists in exactly one place. Two markers sharing
    -- an id make `getCycleMarkers` render a duplicate, empty cycle in History,
    -- and nothing dedupes markers by id.
    --
    -- The description falls back to the app's own auto-label, character for
    -- character (`PARTNER_PAYMENT_LABEL_PREFIX` in lib/domain/expense.ts). Any
    -- other wording would read back through `isPartnerPaymentAutoLabel` as a
    -- user's note, and the journal's edit form would save it as one.
    --
    -- The INNER JOIN on the category is deliberate: an account with no
    -- `combined-expenses` category has nowhere honest to file the row, so its
    -- movements stay put and settlement keeps counting them through the legacy
    -- `gf_paid` read. No payment is lost either way.
    INSERT INTO "Expense" (
        "id", "userId", "categoryId", "subcategoryId", "cardId", "date",
        "description", "amount", "isShared", "yourPercentage",
        "actualExpenditure", "paidBy", "fundedFrom", "isPartnerPayment",
        "isRecurring", "closedAt", "notes", "createdAt", "updatedAt"
    )
    SELECT
        m."id",
        m."userId",
        c."id",
        (SELECT s."id" FROM "Subcategory" s
          WHERE s."userId" = m."userId"
            AND s."categoryId" = c."id"
            AND s."name" = 'Covered for me'
          ORDER BY s."createdAt" ASC, s."id" ASC
          LIMIT 1),
        NULL,
        m."date",
        COALESCE(
            NULLIF(BTRIM(m."note"), ''),
            'Transfer — you paid '
                || COALESCE(NULLIF(BTRIM(st."partnerName"), ''), 'your partner')
        ),
        m."amount",
        false,
        1,
        m."amount",
        'you',
        m."fundedFrom",
        true,
        false,
        m."closedAt",
        NULL,
        m."createdAt",
        NOW()
    FROM "Movement" m
    JOIN "Category" c
        ON c."userId" = m."userId"
       AND c."slug" = 'combined-expenses'
    LEFT JOIN "Settings" st
        ON st."userId" = m."userId"
    WHERE m."type" = 'gf_paid'
    ON CONFLICT ("id") DO NOTHING;
    GET DIAGNOSTICS inserted = ROW_COUNT;

    -- Only the ones that became an expense are removed, and only once that
    -- expense provably carries the same marker. `IS NOT DISTINCT FROM` is what
    -- refuses to drop a boundary: an id collision with some unrelated payment
    -- would otherwise delete a marker that was never transferred.
    --
    -- The `userId` match is the other half of that: ids are unique per table, so
    -- a payment-expense in ANOTHER account could satisfy the id join and delete
    -- this user's movement against a row he has no claim on. Every query in this
    -- codebase is scoped by owner (docs/conventions/architecture.md); a DELETE on
    -- real money is the last place to make an exception.
    DELETE FROM "Movement" m
     WHERE m."type" = 'gf_paid'
       AND EXISTS (
           SELECT 1 FROM "Expense" e
            WHERE e."id" = m."id"
              AND e."userId" = m."userId"
              AND e."isPartnerPayment"
              AND e."closedAt" IS NOT DISTINCT FROM m."closedAt"
       );
    GET DIAGNOSTICS removed = ROW_COUNT;
    RAISE NOTICE 'CHORE-12 conversion: % expenses inserted, % movements removed.',
        inserted, removed;

    EXECUTE format(
        'INSERT INTO _chore12_balance SELECT %L, s."userId", s."balance" FROM (%s) s',
        'after', balance_sql);

    -- The conversion moves money between tables; it must move none in total.
    -- Half a cent is the app's own zero (`isZeroCents`), so anything at or above
    -- it is a real divergence and the transaction dies.
    SELECT b."userId" AS "userId",
           b."balance" AS "before",
           a."balance" AS "after"
      INTO drift
      FROM _chore12_balance b
      JOIN _chore12_balance a
        ON a."userId" = b."userId" AND a."phase" = 'after'
     WHERE b."phase" = 'before'
       AND abs(a."balance" - b."balance") >= 0.005
     LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION
            'CHORE-12: settlement balance moved for user % — before %, after %. '
            'Nothing was committed.',
            drift."userId", drift."before", drift."after";
    END IF;

    DROP TABLE _chore12_balance;
END
$$;

-- ------------------------------------------------------------
-- 3. Round `Expense.actualExpenditure` to the cent.
--
-- `computeActualExpenditure` rounds at the single write point, so only rows
-- written before that fix carry a sub-cent tail. Idempotent — a replay matches
-- nothing — but NOT REVERSIBLE: the discarded fraction is gone. Deliberately
-- outside the balance assertion above; see the note on `balance_sql`.
-- ------------------------------------------------------------
UPDATE "Expense"
SET "actualExpenditure" = ROUND("actualExpenditure"::numeric, 2)
WHERE "actualExpenditure" <> ROUND("actualExpenditure"::numeric, 2);
