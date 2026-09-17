import { describe, it, expect } from "vitest";

import { db } from "@/lib/db";
import { partnerPaymentDescription } from "@/lib/domain/expense";
import { SOLO_PARTNER_FALLBACK } from "@/lib/domain/settings";
import { PrismaSettlementRepository } from "@/lib/repositories/settlement.repository";
import { replayMigration } from "@/tests/support/replay-migration";

/**
 * CHORE-12 — the deferred data conversion, against the migration's own SQL rather
 * than a paraphrase of it. A `gf_paid` movement becomes the payment-expense it
 * already is under ADR-0024, keeping the one thing two dedups recognise it by: its
 * id.
 *
 * The schema-shape assertions this file used to hold moved to the conversion
 * itself — a replay that reaches the end has already proved the column exists.
 */
const MIGRATION = "20260916230000_convert_partner_payments";

const ENTERED_AT = new Date("2026-09-12T02:15:00Z");
const PAID_ON = new Date("2026-09-11T12:00:00Z");

const settlementRepo = new PrismaSettlementRepository(db);

/** A user with the `combined-expenses` home and the PRE-rename subcategory row. */
async function seedUserWithCombined(email: string, partnerName?: string) {
    const user = await db.user.create({
        data: { email, password: "x", name: "T" },
    });
    const category = await db.category.create({
        data: {
            userId: user.id,
            slug: "combined-expenses",
            name: "Combined Expenses",
        },
    });
    const subcategory = await db.subcategory.create({
        data: {
            userId: user.id,
            categoryId: category.id,
            // The name live databases hold. Step 1 of the migration renames it,
            // and step 2 must then find it — that ordering is the test.
            name: "Purchases made by girlfriend",
        },
    });
    if (partnerName) {
        await db.settings.create({
            data: { userId: user.id, sharesExpenses: true, partnerName },
        });
    }
    return { user, category, subcategory };
}

async function seedPayment(
    userId: string,
    overrides: {
        note?: string | null;
        amount?: number;
        fundedFrom?: string;
        closedAt?: Date | null;
    } = {},
) {
    return db.movement.create({
        data: {
            userId,
            date: PAID_ON,
            amount: overrides.amount ?? 380,
            type: "gf_paid",
            note: overrides.note ?? null,
            fundedFrom: overrides.fundedFrom ?? "income",
            closedAt: overrides.closedAt ?? null,
            createdAt: ENTERED_AT,
        },
    });
}

describe("gf_paid → payment expense (spec 0007 §6b, ADR-0024)", () => {
    it("turns a payment into an expense that reaches the budget", async () => {
        const { user, category, subcategory } =
            await seedUserWithCombined("pay@example.com");
        const payment = await seedPayment(user.id, {
            note: "Settled the carwash",
        });

        await replayMigration(MIGRATION);

        const expense = await db.expense.findUniqueOrThrow({
            where: { id: payment.id },
        });
        expect(expense.isPartnerPayment).toBe(true);
        expect(expense.categoryId).toBe(category.id);
        // The row the migration renamed in step 1, not a second one beside it.
        expect(expense.subcategoryId).toBe(subcategory.id);
        // What he sent IS the expenditure — no split is applied (ADR-0024 §3).
        expect(expense.amount).toBe(380);
        expect(expense.actualExpenditure).toBe(380);
        expect(expense.isShared).toBe(false);
        expect(expense.yourPercentage).toBe(1);
        expect(expense.cardId).toBe(null);
        expect(expense.description).toBe("Settled the carwash");
        // `createdAt` is settlement-cycle membership, so it must survive: a
        // converted row stays in the cycle it was already filed under.
        expect(expense.createdAt.toISOString()).toBe(ENTERED_AT.toISOString());

        // One row, not two — `buildFeed` has no twin filter, so a surviving
        // movement would render a second row beside its own expense.
        expect(
            await db.movement.findUnique({ where: { id: payment.id } }),
        ).toBe(null);
    });

    it("gives an unlabelled payment the app's own auto-label", async () => {
        // Any other wording reads back through `isPartnerPaymentAutoLabel` as a
        // user's note, and the journal's edit form then saves it as one.
        const { user } = await seedUserWithCombined(
            "nolabel@example.com",
            "Brenda",
        );
        await seedPayment(user.id, { note: null });

        await replayMigration(MIGRATION);

        const expense = await db.expense.findFirstOrThrow({
            where: { userId: user.id },
        });
        expect(expense.description).toBe(
            partnerPaymentDescription(null, "Brenda"),
        );
    });

    it("falls back to the neutral partner label when none is configured", async () => {
        const { user } = await seedUserWithCombined("nopartner@example.com");
        await seedPayment(user.id, { note: null });

        await replayMigration(MIGRATION);

        const expense = await db.expense.findFirstOrThrow({
            where: { userId: user.id },
        });
        expect(expense.description).toBe(
            partnerPaymentDescription(null, SOLO_PARTNER_FALLBACK),
        );
    });

    it("carries the funding source across, so savings money stays out of the budget", async () => {
        // Dropping `fundedFrom` would convert a savings-funded transfer into an
        // income-funded expense and land it in a budget it was never part of.
        const { user } = await seedUserWithCombined("savings@example.com");
        const payment = await seedPayment(user.id, { fundedFrom: "savings" });

        await replayMigration(MIGRATION);

        const expense = await db.expense.findUniqueOrThrow({
            where: { id: payment.id },
        });
        expect(expense.fundedFrom).toBe("savings");
    });

    it("leaves a payment alone when the user has no combined-expenses category", async () => {
        const user = await db.user.create({
            data: { email: "nocat@example.com", password: "x", name: "T" },
        });
        const payment = await seedPayment(user.id);

        await replayMigration(MIGRATION);

        // Nowhere honest to file it, so the movement stays and the settlement
        // balance keeps counting it through the legacy read. Losing a payment
        // silently would be worse than leaving it where it is.
        const kept = await db.movement.findUnique({
            where: { id: payment.id },
        });
        expect(kept?.type).toBe("gf_paid");
        expect(await db.expense.count({ where: { userId: user.id } })).toBe(0);
    });

    it("does not touch a debt, a received transfer or a card payment", async () => {
        const { user } = await seedUserWithCombined("other@example.com");
        await db.movement.create({
            data: {
                userId: user.id,
                date: new Date("2026-09-10T12:00:00Z"),
                amount: 680,
                type: "gf_fronted",
                note: "she covered the vet",
            },
        });
        await db.movement.create({
            data: {
                userId: user.id,
                date: new Date("2026-09-09T12:00:00Z"),
                amount: 200,
                type: "gf_received",
            },
        });
        await db.movement.create({
            data: {
                userId: user.id,
                date: new Date("2026-09-08T12:00:00Z"),
                amount: 1200,
                type: "card_payment",
            },
        });

        await replayMigration(MIGRATION);

        // A debt stays settlement-only — that is the whole point of the
        // reversal — and neither of the others was ever in scope.
        expect(await db.movement.count({ where: { userId: user.id } })).toBe(3);
        expect(await db.expense.count({ where: { userId: user.id } })).toBe(0);
    });

    it("is a no-op on a replay", async () => {
        const { user } = await seedUserWithCombined("twice@example.com");
        const payment = await seedPayment(user.id, { note: "Once only" });

        await replayMigration(MIGRATION);
        await replayMigration(MIGRATION);

        expect(await db.expense.count({ where: { userId: user.id } })).toBe(1);
        expect(await db.movement.count({ where: { userId: user.id } })).toBe(0);
        const expense = await db.expense.findUniqueOrThrow({
            where: { id: payment.id },
        });
        expect(expense.description).toBe("Once only");
    });
});

describe("a closed cycle survives the conversion (criterion 6)", () => {
    it("converts a marker-carrying payment and MOVES the marker with it", async () => {
        // The preserved SQL refused this row (`AND m."closedAt" IS NULL`) because
        // Expense had nowhere to put the boundary. Half 1 gave it `closedAt`.
        const { user } = await seedUserWithCombined("marker@example.com");
        const closedAt = new Date("2026-09-13T20:38:00Z");
        const marker = await seedPayment(user.id, { amount: 500, closedAt });

        await replayMigration(MIGRATION);

        const expense = await db.expense.findUniqueOrThrow({
            where: { id: marker.id },
        });
        expect(expense.closedAt?.toISOString()).toBe(closedAt.toISOString());
        // MOVED, not copied. Two markers sharing an id make `getCycleMarkers`
        // render a duplicate, empty cycle — nothing dedupes markers by id.
        expect(await db.movement.findUnique({ where: { id: marker.id } })).toBe(
            null,
        );

        const markers = await settlementRepo.getCycleMarkers(user.id);
        expect(markers).toHaveLength(1);
        expect(markers[0]).toMatchObject({
            id: marker.id,
            kind: "expense",
            amount: 500,
        });
    });

    it("keeps the boundary on the movement when the expense did not take it", async () => {
        // An id collision with some unrelated payment-expense: the INSERT is
        // absorbed by ON CONFLICT, so the marker was never transferred and the
        // DELETE must refuse rather than dissolve the cycle.
        const { user, category } = await seedUserWithCombined(
            "collide@example.com",
        );
        const closedAt = new Date("2026-09-13T20:38:00Z");
        const marker = await seedPayment(user.id, { amount: 500, closedAt });
        await db.expense.create({
            data: {
                id: marker.id,
                userId: user.id,
                categoryId: category.id,
                date: PAID_ON,
                description: "Pre-existing twin",
                amount: 500,
                actualExpenditure: 500,
                isPartnerPayment: true,
                createdAt: ENTERED_AT,
            },
        });

        await replayMigration(MIGRATION);

        const kept = await db.movement.findUnique({ where: { id: marker.id } });
        expect(kept?.closedAt?.toISOString()).toBe(closedAt.toISOString());
        // Exactly one marker still, so History renders one cycle.
        expect(await settlementRepo.getCycleMarkers(user.id)).toHaveLength(1);
    });

    it("never deletes a payment against another account's expense", async () => {
        // Ids are unique per table, not per account, so an id shared across two
        // users must not let one user's expense authorise deleting the other's
        // movement — that payment would leave no expense behind at all.
        const { user } = await seedUserWithCombined("mine@example.com");
        const payment = await seedPayment(user.id, { amount: 500 });
        const { user: other, category: otherCategory } =
            await seedUserWithCombined("theirs@example.com");
        await db.expense.create({
            data: {
                id: payment.id,
                userId: other.id,
                categoryId: otherCategory.id,
                date: PAID_ON,
                description: "Their own payment",
                amount: 500,
                actualExpenditure: 500,
                isPartnerPayment: true,
                createdAt: ENTERED_AT,
            },
        });

        await replayMigration(MIGRATION);

        // The INSERT collided on the id and did nothing, so the payment never
        // became an expense — it therefore stays a movement, which settlement
        // still counts through the legacy `gf_paid` read.
        const mine = await db.movement.findUniqueOrThrow({
            where: { id: payment.id },
        });
        expect(mine.userId).toBe(user.id);
        expect(await db.expense.count({ where: { userId: user.id } })).toBe(0);
    });
});

describe("the settlement balance is unmoved (criterion 5)", () => {
    it("converts a full ledger without shifting the balance a cent", async () => {
        // The migration asserts this itself and rolls back on a mismatch, so
        // reaching the assertions below IS the proof. They pin the figures the
        // balance is made of, so a future edit cannot satisfy the assertion by
        // dropping rows from both sides.
        const { user, category } = await seedUserWithCombined(
            "ledger@example.com",
            "Brenda",
        );
        await seedPayment(user.id, { amount: 380, note: "Carwash" });
        await seedPayment(user.id, { amount: 500, fundedFrom: "savings" });
        await db.movement.create({
            data: {
                userId: user.id,
                date: PAID_ON,
                amount: 680,
                type: "gf_fronted",
            },
        });
        await db.movement.create({
            data: {
                userId: user.id,
                date: PAID_ON,
                amount: 200,
                type: "gf_received",
            },
        });
        await db.expense.create({
            data: {
                userId: user.id,
                categoryId: category.id,
                date: PAID_ON,
                description: "Sushi",
                amount: 1000,
                isShared: true,
                yourPercentage: 0.68,
                actualExpenditure: 680,
            },
        });

        await replayMigration(MIGRATION);

        const paid = await db.expense.aggregate({
            where: { userId: user.id, isPartnerPayment: true },
            _sum: { actualExpenditure: true },
        });
        expect(paid._sum.actualExpenditure).toBe(880);
        // Only the two payments left the movement table.
        const remaining = await db.movement.findMany({
            where: { userId: user.id },
            select: { type: true },
        });
        expect(remaining.map((m) => m.type).sort()).toEqual([
            "gf_fronted",
            "gf_received",
        ]);
    });
});

describe("the balance assertion is load-bearing (criterion 5)", () => {
    it("aborts the migration and leaves nothing behind when the balance moves", async () => {
        // Every other test here reaches its assertions only because the balance
        // held, which proves nothing about the assertion itself: break it and
        // they would all still pass. The conversion is balance-neutral by
        // construction, so the only way to watch the assertion fire is to move
        // the money on purpose — a trigger that inflates each inserted expense.
        const { user, subcategory } = await seedUserWithCombined(
            "rollback@example.com",
        );
        const payment = await seedPayment(user.id, { amount: 380 });

        await db.$executeRawUnsafe(`
            CREATE OR REPLACE FUNCTION _chore12_inflate() RETURNS trigger AS $fn$
            BEGIN
                NEW."actualExpenditure" := NEW."actualExpenditure" + 1;
                RETURN NEW;
            END
            $fn$ LANGUAGE plpgsql`);
        // Dropped first, not only in `finally`: a killed process or a CI timeout
        // would leave the trigger on a table every other integration file writes
        // to, and `truncate.ts` removes rows, never schema objects.
        await db.$executeRawUnsafe(
            `DROP TRIGGER IF EXISTS _chore12_inflate ON "Expense"`,
        );
        await db.$executeRawUnsafe(`
            CREATE TRIGGER _chore12_inflate BEFORE INSERT ON "Expense"
            FOR EACH ROW EXECUTE FUNCTION _chore12_inflate()`);

        try {
            await expect(replayMigration(MIGRATION)).rejects.toThrow(
                /settlement balance moved/,
            );
        } finally {
            await db.$executeRawUnsafe(
                `DROP TRIGGER IF EXISTS _chore12_inflate ON "Expense"`,
            );
            await db.$executeRawUnsafe(
                `DROP FUNCTION IF EXISTS _chore12_inflate()`,
            );
        }

        // Nothing committed, across the WHOLE file: no converted expense, the
        // payment still a movement, and step 1's rename undone with them. One
        // transaction or none of it — production must survive a failed deploy
        // exactly as it was.
        expect(await db.expense.count({ where: { userId: user.id } })).toBe(0);
        const kept = await db.movement.findUniqueOrThrow({
            where: { id: payment.id },
        });
        expect(kept.type).toBe("gf_paid");
        const name = await db.subcategory.findUniqueOrThrow({
            where: { id: subcategory.id },
        });
        expect(name.name).toBe("Purchases made by girlfriend");
    });
});

describe("the cents backfill (not reversible)", () => {
    it("rounds a sub-cent actualExpenditure and leaves a clean one alone", async () => {
        const { user, category } =
            await seedUserWithCombined("cents@example.com");
        const ragged = await db.expense.create({
            data: {
                userId: user.id,
                categoryId: category.id,
                date: PAID_ON,
                description: "Ragged",
                amount: 1000,
                isShared: true,
                yourPercentage: 0.68,
                actualExpenditure: 680.004,
            },
        });
        const clean = await db.expense.create({
            data: {
                userId: user.id,
                categoryId: category.id,
                date: PAID_ON,
                description: "Clean",
                amount: 500,
                actualExpenditure: 500,
            },
        });

        await replayMigration(MIGRATION);

        expect(
            (await db.expense.findUniqueOrThrow({ where: { id: ragged.id } }))
                .actualExpenditure,
        ).toBe(680);
        expect(
            (await db.expense.findUniqueOrThrow({ where: { id: clean.id } }))
                .actualExpenditure,
        ).toBe(500);
    });
});
