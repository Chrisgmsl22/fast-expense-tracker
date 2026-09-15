import { describe, it, expect } from "vitest";

import { db } from "@/lib/db";
import { replayMigration } from "@/tests/support/replay-migration";

/**
 * Spec 0007 §6b — the reversal, against the migration's own SQL rather than a
 * paraphrase of it. Two conversions in one file:
 *
 * - a debt that slice E turned into an expense goes back to a movement;
 * - a `gf_paid` movement becomes the payment-expense that now reaches the budget.
 *
 * The slice-E column is already renamed by the time the schema is built, so the
 * "before" state here is seeded through the CURRENT column — which is exactly
 * what the local database looked like when the migration ran.
 */
const MIGRATION = "20260916210000_payment_is_the_expense";

const ENTERED_AT = new Date("2026-09-12T02:15:00Z");

async function seedUserWithCombined(email: string) {
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
            name: "Covered for me",
        },
    });
    return { user, category, subcategory };
}

async function seedPayment(userId: string, note: string | null = null) {
    return db.movement.create({
        data: {
            userId,
            date: new Date("2026-09-11T12:00:00Z"),
            amount: 380,
            type: "gf_paid",
            note,
            createdAt: ENTERED_AT,
        },
    });
}

describe("gf_paid → payment expense (spec 0007 §6b)", () => {
    it("turns a payment into an expense that reaches the budget", async () => {
        const { user, category, subcategory } =
            await seedUserWithCombined("pay@example.com");
        const payment = await seedPayment(user.id, "Settled the carwash");

        await replayMigration(MIGRATION);

        const expense = await db.expense.findUniqueOrThrow({
            where: { id: payment.id },
        });
        expect(expense.isPartnerPayment).toBe(true);
        expect(expense.categoryId).toBe(category.id);
        expect(expense.subcategoryId).toBe(subcategory.id);
        // What he sent IS the expenditure — no split is applied.
        expect(expense.amount).toBe(380);
        expect(expense.actualExpenditure).toBe(380);
        expect(expense.isShared).toBe(false);
        expect(expense.description).toBe("Settled the carwash");
        // `createdAt` is settlement-cycle membership, so it must survive: a
        // converted row stays in the cycle it was already filed under.
        expect(expense.createdAt.toISOString()).toBe(ENTERED_AT.toISOString());

        // One row, not two — the movement is gone.
        expect(
            await db.movement.findUnique({ where: { id: payment.id } }),
        ).toBe(null);
    });

    it("gives an unlabelled payment a readable description", async () => {
        const { user } = await seedUserWithCombined("nolabel@example.com");
        await seedPayment(user.id, null);

        await replayMigration(MIGRATION);

        const expense = await db.expense.findFirstOrThrow({
            where: { userId: user.id },
        });
        expect(expense.description).toBe("Payment to partner");
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

    it("does not touch a debt or a card payment", async () => {
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
                amount: 1200,
                type: "card_payment",
            },
        });

        await replayMigration(MIGRATION);

        // A debt stays settlement-only — that is the whole point of the
        // reversal — and a card payment was never in scope.
        expect(await db.movement.count({ where: { userId: user.id } })).toBe(2);
        expect(await db.expense.count({ where: { userId: user.id } })).toBe(0);
    });
});
