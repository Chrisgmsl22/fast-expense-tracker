import { describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { bucketOf } from "@/lib/domain/dashboard";
import { PrismaCategoryRepository } from "@/lib/repositories/category.repository";
import { PrismaUserProvisioningRepository } from "@/lib/repositories/user-provisioning.repository";
import { replayMigration } from "@/tests/support/replay-migration";

const MIGRATION = "20261119000000_add_vacation_category";
const provisioning = new PrismaUserProvisioningRepository(db);
const categories = new PrismaCategoryRepository(db);
const NAMES = [
    "Flights",
    "Lodging",
    "Local transport",
    "Food and snacks",
    "Activities",
    "Souvenirs",
];

async function createUser(email: string) {
    return db.user.create({ data: { email, name: "Test" } });
}

async function vacation(userId: string) {
    return db.category.findUniqueOrThrow({
        where: { userId_slug: { userId, slug: "vacation" } },
    });
}

async function subcategories(userId: string, categoryId: string) {
    return db.subcategory.findMany({
        where: { userId, categoryId },
        orderBy: { name: "asc" },
    });
}

async function expectDefaults(userId: string) {
    const category = await vacation(userId);
    expect(category).toMatchObject({
        userId,
        slug: "vacation",
        name: "Vacation",
        color: "#ea580c",
        isRelevant: false,
        isSystemCategory: true,
        monthlyBudget: null,
    });
    expect(category.updatedAt).toEqual(category.createdAt);
    const rows = await subcategories(userId, category.id);
    expect(rows.map((row) => row.name)).toEqual([...NAMES].sort());
    for (const row of rows) {
        expect(row.updatedAt).toEqual(row.createdAt);
    }
    expect(bucketOf(category)).toBe("discretionary");
    return category;
}

describe("Vacation category rollout", () => {
    it("backfills existing accounts without changing their categories, budgets, or expenses", async () => {
        const first = await createUser("first@example.com");
        const second = await createUser("second@example.com");
        const held = await db.category.create({
            data: {
                userId: first.id,
                slug: "disposable-income",
                name: "My free spending",
                isRelevant: false,
                monthlyBudget: 500,
                color: "#123456",
            },
        });
        // An existing same-named subcategory remains in its original category.
        const oldVacation = await db.subcategory.create({
            data: {
                userId: first.id,
                categoryId: held.id,
                name: "Vacation",
            },
        });
        const budget = await db.categoryBudget.create({
            data: {
                userId: first.id,
                categoryId: held.id,
                month: "2026-11",
                amount: 400,
            },
        });
        const expense = await db.expense.create({
            data: {
                userId: first.id,
                categoryId: held.id,
                subcategoryId: oldVacation.id,
                date: new Date("2026-11-01T12:00:00Z"),
                description: "Invented trip",
                amount: 100,
                isShared: true,
                yourPercentage: 0.5,
                actualExpenditure: 50,
                fundedFrom: "savings",
            },
        });

        await replayMigration(MIGRATION);

        const a = await expectDefaults(first.id);
        const b = await expectDefaults(second.id);
        expect(a.id).not.toBe(b.id);
        expect(
            await db.category.findUniqueOrThrow({ where: { id: held.id } }),
        ).toEqual(held);
        expect(
            await db.subcategory.findUniqueOrThrow({
                where: { id: oldVacation.id },
            }),
        ).toEqual(oldVacation);
        expect(
            await db.categoryBudget.findUniqueOrThrow({
                where: { id: budget.id },
            }),
        ).toEqual(budget);
        expect(
            await db.expense.findUniqueOrThrow({ where: { id: expense.id } }),
        ).toEqual(expense);
    });

    it("preserves held Vacation rows and adds only missing exact names for each owner and category", async () => {
        const user = await createUser("held@example.com");
        const other = await createUser("other@example.com");
        const held = await db.category.create({
            data: {
                userId: user.id,
                slug: "vacation",
                name: "My trips",
                color: "#123456",
                monthlyBudget: 700,
                isRelevant: false,
                isSystemCategory: false,
            },
        });
        const elsewhere = await db.category.create({
            data: {
                userId: user.id,
                slug: "personal",
                name: "Personal",
            },
        });
        const flight = await db.subcategory.create({
            data: {
                userId: user.id,
                categoryId: held.id,
                name: "Flights",
                createdAt: new Date("2026-01-01Z"),
                updatedAt: new Date("2026-01-01Z"),
            },
        });
        const lowerCase = await db.subcategory.create({
            data: {
                userId: user.id,
                categoryId: held.id,
                name: "flights",
            },
        });
        const elsewhereFlight = await db.subcategory.create({
            data: {
                userId: user.id,
                categoryId: elsewhere.id,
                name: "Flights",
            },
        });

        await replayMigration(MIGRATION);
        const before = await subcategories(user.id, held.id);
        expect(await subcategories(user.id, elsewhere.id)).toEqual([
            elsewhereFlight,
        ]);
        await replayMigration(MIGRATION);
        await provisioning.provisionNewUser(user.id);

        expect(await vacation(user.id)).toEqual(held);
        expect(await subcategories(user.id, held.id)).toEqual(before);
        expect(before.map((row) => row.name).sort()).toEqual(
            [...NAMES, "flights"].sort(),
        );
        expect(before).toContainEqual(flight);
        expect(before).toContainEqual(lowerCase);
        expect(await subcategories(user.id, elsewhere.id)).toContainEqual(
            elsewhereFlight,
        );
        await expectDefaults(other.id);
    });

    it("backfills an account without categories and lets provisioning supply the remaining defaults", async () => {
        const user = await createUser("empty@example.com");
        await replayMigration(MIGRATION);
        const held = await expectDefaults(user.id);
        expect(await db.category.count({ where: { userId: user.id } })).toBe(1);
        await provisioning.provisionNewUser(user.id);
        expect(await vacation(user.id)).toEqual(held);
        await expectDefaults(user.id);
    });

    it("gives a new signup Vacation and exposes its subcategories through normal picker and category reads", async () => {
        const { userId } = await provisioning.createUserWithStarterKit({
            name: "Invented User",
            email: "signup@example.com",
            password: "Invented-pass-123",
        });
        const category = await expectDefaults(userId);
        expect(await categories.listForPicker(userId)).toContainEqual({
            id: category.id,
            slug: "vacation",
            name: "Vacation",
            color: "#ea580c",
        });
        const options = await categories.listSubcategoriesForPicker(userId);
        expect(
            options
                .filter((row) => row.categoryId === category.id)
                .map((row) => row.name)
                .sort(),
        ).toEqual([...NAMES].sort());
        expect(await categories.getBySlug(userId, "vacation")).toMatchObject({
            id: category.id,
            monthlyBudget: null,
        });
        expect(await categories.getBySlug("other-user", "vacation")).toBeNull();
        const disposable = await db.category.findUniqueOrThrow({
            where: { userId_slug: { userId, slug: "disposable-income" } },
        });
        expect(
            (await subcategories(userId, disposable.id)).map((row) => row.name),
        ).not.toContain("Vacation");
    });

    it("counts income-funded Vacation shares in the monthly budget and keeps savings-funded expenses outside it", async () => {
        const user = await createUser("funding@example.com");
        await replayMigration(MIGRATION);
        const category = await vacation(user.id);
        const flights = (await subcategories(user.id, category.id)).find(
            (row) => row.name === "Flights",
        )!;
        for (const fundedFrom of ["income", "savings"]) {
            await db.expense.create({
                data: {
                    userId: user.id,
                    categoryId: category.id,
                    subcategoryId: flights.id,
                    date: new Date("2026-11-01T12:00:00Z"),
                    description: "Invented flight",
                    amount: 100,
                    isShared: true,
                    yourPercentage: 0.5,
                    actualExpenditure: 50,
                    fundedFrom,
                },
            });
        }
        const spends = await categories.getSubcategorySpends(
            user.id,
            category.id,
            "2026-11",
        );
        expect(spends.reduce((sum, row) => sum + row.spent, 0)).toBe(50);
        const rows = await categories.getExpensesForCategoryMonth(
            user.id,
            category.id,
            "2026-11",
        );
        expect(rows).toHaveLength(2);
        expect(
            rows.find((row) => row.fundedFrom === "income")?.countedInBudget,
        ).toBe(true);
        expect(
            rows.find((row) => row.fundedFrom === "savings")?.countedInBudget,
        ).toBe(false);
    });
});
