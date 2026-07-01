import { describe, it, expect } from "vitest";

import { db } from "@/lib/db";
import { PrismaDashboardRepository } from "@/lib/repositories/dashboard.repository";

const repo = new PrismaDashboardRepository(db);

async function seedUser(email = "u@example.com") {
    return db.user.create({ data: { email, password: "x", name: "Test" } });
}

async function seedCategory(slug: string, isRelevant = true) {
    return db.category.create({ data: { slug, name: slug, isRelevant } });
}

async function seedExpense(opts: {
    userId: string;
    categoryId: string;
    date: string;
    amount: number;
    actualExpenditure: number;
}) {
    return db.expense.create({
        data: {
            userId: opts.userId,
            categoryId: opts.categoryId,
            date: new Date(opts.date),
            description: "x",
            amount: opts.amount,
            actualExpenditure: opts.actualExpenditure,
        },
    });
}

describe("PrismaDashboardRepository.getCategorySpends (integration)", () => {
    it("returns an empty array for a month with no expenses", async () => {
        const user = await seedUser();
        expect(await repo.getCategorySpends(user.id, "2026-06")).toEqual([]);
    });

    it("sums my-share (actualExpenditure) per category, with slug + isRelevant", async () => {
        const user = await seedUser();
        const housing = await seedCategory("housing", true);
        const fun = await seedCategory("disposable-income", false);

        // Two housing rows in-month — should sum on actualExpenditure, not amount.
        await seedExpense({
            userId: user.id,
            categoryId: housing.id,
            date: "2026-06-05T12:00:00Z",
            amount: 1000,
            actualExpenditure: 680,
        });
        await seedExpense({
            userId: user.id,
            categoryId: housing.id,
            date: "2026-06-20T12:00:00Z",
            amount: 500,
            actualExpenditure: 500,
        });
        await seedExpense({
            userId: user.id,
            categoryId: fun.id,
            date: "2026-06-10T12:00:00Z",
            amount: 300,
            actualExpenditure: 300,
        });

        const rows = await repo.getCategorySpends(user.id, "2026-06");
        const bySlug = Object.fromEntries(rows.map((r) => [r.slug, r]));
        expect(bySlug.housing).toEqual({
            slug: "housing",
            isRelevant: true,
            spent: 1180,
        });
        expect(bySlug["disposable-income"]).toEqual({
            slug: "disposable-income",
            isRelevant: false,
            spent: 300,
        });
    });

    it("excludes other months and other users", async () => {
        const user = await seedUser("me@example.com");
        const other = await seedUser("other@example.com");
        const cat = await seedCategory("housing", true);

        await seedExpense({
            userId: user.id,
            categoryId: cat.id,
            date: "2026-06-10T12:00:00Z",
            amount: 100,
            actualExpenditure: 100,
        });
        // Out of month + another user's in-month row — both excluded.
        await seedExpense({
            userId: user.id,
            categoryId: cat.id,
            date: "2026-05-10T12:00:00Z",
            amount: 999,
            actualExpenditure: 999,
        });
        await seedExpense({
            userId: other.id,
            categoryId: cat.id,
            date: "2026-06-15T12:00:00Z",
            amount: 777,
            actualExpenditure: 777,
        });

        const rows = await repo.getCategorySpends(user.id, "2026-06");
        expect(rows).toEqual([
            { slug: "housing", isRelevant: true, spent: 100 },
        ]);
    });
});
