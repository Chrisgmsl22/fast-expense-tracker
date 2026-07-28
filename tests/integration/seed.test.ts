import { describe, it, expect } from "vitest";
import bcrypt from "bcryptjs";

import { db } from "@/lib/db";
import { STARTER_CATEGORIES } from "@/lib/domain/starter-kit";
import { OWNER_CARDS, runSeed } from "@/prisma/seed";

// The owner seed against a real Postgres: it provisions the starter kit, adds
// the owner-only extras, and stays idempotent — including the deliberate
// "never clobber a rotated password" rule.

const ADMIN = { adminEmail: "owner@example.com", adminPassword: "s3cret-pw" };

const STARTER_SUBCATEGORY_COUNT = STARTER_CATEGORIES.reduce(
    (total, category) => total + category.subcategories.length,
    0,
);

async function ownerId(): Promise<string> {
    const owner = await db.user.findUniqueOrThrow({
        where: { email: ADMIN.adminEmail },
    });
    return owner.id;
}

describe("runSeed on an empty database", () => {
    it("creates the owner with a bcrypt hash, never the plaintext", async () => {
        await runSeed(db, ADMIN);

        const owner = await db.user.findUniqueOrThrow({
            where: { email: ADMIN.adminEmail },
        });
        expect(owner.password).not.toBe(ADMIN.adminPassword);
        expect(await bcrypt.compare(ADMIN.adminPassword, owner.password)).toBe(
            true,
        );
    });

    it("provisions the owner the full starter kit", async () => {
        const summary = await runSeed(db, ADMIN);
        const userId = await ownerId();

        expect(summary).toMatchObject({
            categories: STARTER_CATEGORIES.length,
            subcategories: STARTER_SUBCATEGORY_COUNT,
            settingsCreated: true,
            fixedIncomeCreated: true,
        });
        expect(await db.category.count({ where: { userId } })).toBe(
            STARTER_CATEGORIES.length,
        );
        expect(await db.subcategory.count({ where: { userId } })).toBe(
            STARTER_SUBCATEGORY_COUNT,
        );
        expect(
            await db.settings.findUnique({ where: { userId } }),
        ).toMatchObject({ sharesExpenses: false });
    });

    it("gives the owner the Cash card plus the four branded ones", async () => {
        const summary = await runSeed(db, ADMIN);
        const userId = await ownerId();

        expect(summary.cards).toBe(OWNER_CARDS.length + 1);
        const cards = await db.card.findMany({
            where: { userId },
            orderBy: { name: "asc" },
        });
        expect(cards.map((c) => c.name)).toEqual([
            "Amex Gold",
            "Amex Platinum",
            "BBVA",
            "Cash",
            "NU",
        ]);
        expect(cards.filter((c) => c.type === "cash")).toHaveLength(1);
    });

    it("creates a single FIXED income row", async () => {
        await runSeed(db, ADMIN);
        const userId = await ownerId();

        const incomes = await db.income.findMany({ where: { userId } });
        expect(incomes).toHaveLength(1);
        expect(incomes[0]).toMatchObject({ type: "FIXED" });
        expect(incomes[0]!.amount).toBeGreaterThan(0);
    });
});

describe("runSeed re-run (idempotent)", () => {
    it("adds nothing the second time", async () => {
        await runSeed(db, ADMIN);
        const summary = await runSeed(db, ADMIN);
        const userId = await ownerId();

        expect(summary).toEqual({
            categories: STARTER_CATEGORIES.length,
            subcategories: 0,
            cards: 0,
            settingsCreated: false,
            fixedIncomeCreated: false,
        });
        expect(await db.user.count()).toBe(1);
        expect(await db.category.count({ where: { userId } })).toBe(
            STARTER_CATEGORIES.length,
        );
        expect(await db.subcategory.count({ where: { userId } })).toBe(
            STARTER_SUBCATEGORY_COUNT,
        );
        expect(await db.card.count({ where: { userId } })).toBe(
            OWNER_CARDS.length + 1,
        );
        expect(await db.income.count({ where: { userId } })).toBe(1);
    });

    it("keeps a rotated password instead of resetting it", async () => {
        await runSeed(db, ADMIN);
        const rotated = await bcrypt.hash("rotated-in-prod", 10);
        await db.user.update({
            where: { email: ADMIN.adminEmail },
            data: { password: rotated },
        });

        await runSeed(db, { ...ADMIN, adminPassword: "a-different-password" });

        const owner = await db.user.findUniqueOrThrow({
            where: { email: ADMIN.adminEmail },
        });
        expect(owner.password).toBe(rotated);
        expect(await bcrypt.compare("rotated-in-prod", owner.password)).toBe(
            true,
        );
    });

    it("keeps an edited fixed income", async () => {
        await runSeed(db, ADMIN);
        const userId = await ownerId();
        await db.income.updateMany({
            where: { userId, type: "FIXED" },
            data: { amount: 12345 },
        });

        await runSeed(db, ADMIN);

        const incomes = await db.income.findMany({ where: { userId } });
        expect(incomes).toHaveLength(1);
        expect(incomes[0]!.amount).toBe(12345);
    });
});
