import { describe, it, expect } from "vitest";

import { db } from "@/lib/db";
import { replayMigration } from "@/tests/support/replay-migration";

/**
 * Spec 0007 §6a criterion 9 — existing `gf_fronted` movements become fronted
 * expenses. Real rows exist in dev and production, so the conversion is tested
 * against the migration's own SQL, read from disk and replayed, rather than a
 * paraphrase of it. That also proves the whole file is idempotent.
 */
const MIGRATION = "20260914210000_fronted_debt_as_expense";

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

const ENTERED_AT = new Date("2026-09-12T02:15:00Z");

async function seedDebt(userId: string, over: { note?: string | null } = {}) {
    return db.movement.create({
        data: {
            userId,
            date: new Date("2026-09-10T12:00:00Z"),
            amount: 680,
            type: "gf_fronted",
            note: over.note ?? null,
            createdAt: ENTERED_AT,
        },
    });
}

describe("gf_fronted → fronted expense conversion (spec 0007 §6a)", () => {
    it("converts a debt into a fronted expense and removes the movement", async () => {
        const { user, category, subcategory } =
            await seedUserWithCombined("conv@example.com");
        await db.settings.create({
            data: { userId: user.id, partnerName: "Brenda" },
        });
        const debt = await seedDebt(user.id);

        await replayMigration(MIGRATION);

        const expense = await db.expense.findUniqueOrThrow({
            where: { id: debt.id },
        });
        expect(expense.isFronted).toBe(true);
        expect(expense.categoryId).toBe(category.id);
        expect(expense.subcategoryId).toBe(subcategory.id);
        // The amount was already his share, so no split is applied.
        expect(expense.amount).toBe(680);
        expect(expense.actualExpenditure).toBe(680);
        expect(expense.isShared).toBe(false);
        expect(expense.cardId).toBeNull();
        // An untitled debt keeps the label the journal always showed.
        expect(expense.description).toBe("I owe Brenda");
        // `createdAt` is settlement-cycle membership, so it must survive: a
        // converted row has to stay in the cycle it was already filed under.
        expect(expense.createdAt.toISOString()).toBe(ENTERED_AT.toISOString());

        expect(await db.movement.findUnique({ where: { id: debt.id } })).toBe(
            null,
        );
    });

    it("keeps the note as the description", async () => {
        const { user } = await seedUserWithCombined("note@example.com");
        const debt = await seedDebt(user.id, { note: "Sushi" });

        await replayMigration(MIGRATION);

        const expense = await db.expense.findUniqueOrThrow({
            where: { id: debt.id },
        });
        expect(expense.description).toBe("Sushi");
    });

    it("is idempotent — a replay creates no second expense", async () => {
        const { user } = await seedUserWithCombined("twice@example.com");
        await seedDebt(user.id);

        await replayMigration(MIGRATION);
        await replayMigration(MIGRATION);

        expect(await db.expense.count({ where: { userId: user.id } })).toBe(1);
    });

    it("leaves a debt alone when the user has no combined-expenses category", async () => {
        const user = await db.user.create({
            data: { email: "nocat@example.com", password: "x", name: "T" },
        });
        const debt = await seedDebt(user.id);

        await replayMigration(MIGRATION);

        // Nowhere honest to file it, so the movement stays and the settlement
        // balance keeps counting it. Losing the debt silently would be worse.
        const kept = await db.movement.findUnique({ where: { id: debt.id } });
        expect(kept?.type).toBe("gf_fronted");
        expect(await db.expense.count({ where: { userId: user.id } })).toBe(0);
    });

    it("does not touch transfers or card payments", async () => {
        const { user } = await seedUserWithCombined("other@example.com");
        await db.movement.create({
            data: {
                userId: user.id,
                date: new Date("2026-09-11T12:00:00Z"),
                amount: 8011.2,
                type: "gf_paid",
            },
        });

        await replayMigration(MIGRATION);

        expect(await db.movement.count({ where: { userId: user.id } })).toBe(1);
        expect(await db.expense.count({ where: { userId: user.id } })).toBe(0);
    });
});
