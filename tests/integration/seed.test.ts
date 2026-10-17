import bcrypt from "bcryptjs";
import { describe, it, expect } from "vitest";

import { db } from "@/lib/db";
import { STARTER_CATEGORIES } from "@/lib/domain/starter-kit";
import { runSeed } from "@/prisma/seed";
import { STARTER_SUBCATEGORY_COUNT } from "@/tests/support/fake-user-provisioning-repository";

const OPTIONS = {
    adminEmail: "Owner@Example.com",
    adminPassword: "invented-secret",
};

async function owner() {
    return db.user.findUniqueOrThrow({
        where: { email: "owner@example.com" },
    });
}

async function counts(userId: string) {
    return {
        users: await db.user.count(),
        categories: await db.category.count({ where: { userId } }),
        subcategories: await db.subcategory.count({ where: { userId } }),
        cards: await db.card.count({ where: { userId } }),
        incomes: await db.income.count({ where: { userId } }),
        settings: await db.settings.count({ where: { userId } }),
    };
}

describe("runSeed against a real database", () => {
    it("Should leave the owner with the starter kit plus his own cards and income", async () => {
        await runSeed(db, OPTIONS);

        const user = await owner();
        expect(user.name).toBe("Christian");
        expect(await counts(user.id)).toEqual({
            users: 1,
            categories: STARTER_CATEGORIES.length,
            subcategories: STARTER_SUBCATEGORY_COUNT,
            cards: 5,
            incomes: 1,
            settings: 1,
        });
        const cards = await db.card.findMany({
            where: { userId: user.id },
            orderBy: { name: "asc" },
            select: { name: true, type: true },
        });
        expect(cards).toEqual([
            { name: "Amex Gold", type: "credit" },
            { name: "Amex Platinum", type: "credit" },
            { name: "BBVA", type: "debit" },
            { name: "Cash", type: "cash" },
            { name: "NU", type: "credit" },
        ]);
        expect(
            await db.settings.findUniqueOrThrow({ where: { userId: user.id } }),
        ).toMatchObject({ sharesExpenses: false, defaultSharePercentage: 0.5 });
    });

    it("Should create nothing new when run twice in a row", async () => {
        await runSeed(db, OPTIONS);
        const user = await owner();
        const first = await counts(user.id);

        const summary = await runSeed(db, OPTIONS);

        expect(await counts(user.id)).toEqual(first);
        expect(summary).toEqual({
            provisioned: {
                categoriesCreated: 0,
                subcategoriesCreated: 0,
                cardsCreated: 0,
                settingsCreated: false,
            },
            ownerCardsCreated: 0,
            fixedIncomeCreated: false,
        });
    });

    it("Should no longer rewrite a category the owner edited", async () => {
        await runSeed(db, OPTIONS);
        const user = await owner();
        await db.category.update({
            where: { userId_slug: { userId: user.id, slug: "groceries" } },
            data: { name: "Super", color: "#101010", isRelevant: false },
        });

        await runSeed(db, OPTIONS);

        expect(
            await db.category.findUniqueOrThrow({
                where: { userId_slug: { userId: user.id, slug: "groceries" } },
            }),
        ).toMatchObject({ name: "Super", color: "#101010", isRelevant: false });
    });

    it("Should keep the password and refresh the owner cards' color on a re-run", async () => {
        await runSeed(db, OPTIONS);
        const user = await owner();
        await db.card.updateMany({
            where: { userId: user.id, name: "NU" },
            data: { color: "#000000" },
        });

        await runSeed(db, { ...OPTIONS, adminPassword: "another-secret" });

        const after = await owner();
        expect(
            await bcrypt.compare(OPTIONS.adminPassword, after.password),
        ).toBe(true);
        const nu = await db.card.findFirstOrThrow({
            where: { userId: user.id, name: "NU" },
        });
        expect(nu.color).toBe("#9333ea");
    });
});
