import { describe, it, expect } from "vitest";

import { db } from "@/lib/db";
import { PrismaDashboardRepository } from "@/lib/repositories/dashboard.repository";

const repo = new PrismaDashboardRepository(db);

async function seedUser(email = "u@example.com") {
    return db.user.create({ data: { email, password: "x", name: "Test" } });
}

async function seedCategory(
    slug: string,
    isRelevant = true,
    monthlyBudget: number | null = null,
) {
    return db.category.create({
        data: { slug, name: slug, isRelevant, monthlyBudget },
    });
}

async function seedExpense(opts: {
    userId: string;
    categoryId: string;
    date: string;
    amount: number;
    actualExpenditure: number;
    subcategoryId?: string;
}) {
    return db.expense.create({
        data: {
            userId: opts.userId,
            categoryId: opts.categoryId,
            subcategoryId: opts.subcategoryId ?? null,
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
        // name = slug (seed helper), color = schema default hex.
        expect(bySlug.housing).toEqual({
            slug: "housing",
            name: "housing",
            color: "#6b7280",
            isRelevant: true,
            spent: 1180,
        });
        expect(bySlug["disposable-income"]).toEqual({
            slug: "disposable-income",
            name: "disposable-income",
            color: "#6b7280",
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
            {
                slug: "housing",
                name: "housing",
                color: "#6b7280",
                isRelevant: true,
                spent: 100,
            },
        ]);
    });
});

describe("PrismaDashboardRepository.getCardSpends (integration)", () => {
    async function seedCard(userId: string, name: string, color: string) {
        return db.card.create({
            data: { userId, name, color, type: "credit" },
        });
    }

    it("returns an empty array for a month with no expenses", async () => {
        const user = await seedUser();
        expect(await repo.getCardSpends(user.id, "2026-06")).toEqual([]);
    });

    it("sums my-share per card high→low and rolls null-card spend up as Cash", async () => {
        const user = await seedUser();
        const cat = await seedCategory("housing", true);
        const bbva = await seedCard(user.id, "BBVA", "#2563eb");

        await seedExpense({
            userId: user.id,
            categoryId: cat.id,
            date: "2026-06-05T12:00:00Z",
            amount: 1000,
            actualExpenditure: 800,
        });
        // Reassign the first row to BBVA (seedExpense defaults cardId null = cash).
        await db.expense.updateMany({
            where: { userId: user.id },
            data: { cardId: bbva.id },
        });
        // A cash row (cardId null).
        await seedExpense({
            userId: user.id,
            categoryId: cat.id,
            date: "2026-06-08T12:00:00Z",
            amount: 300,
            actualExpenditure: 300,
        });

        const rows = await repo.getCardSpends(user.id, "2026-06");
        expect(rows).toEqual([
            { id: bbva.id, name: "BBVA", color: "#2563eb", spent: 800 },
            { id: "cash", name: "Cash", color: "#16a34a", spent: 300 },
        ]);
    });

    it("scopes to the user + month", async () => {
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

        const rows = await repo.getCardSpends(user.id, "2026-06");
        expect(rows).toEqual([
            { id: "cash", name: "Cash", color: "#16a34a", spent: 100 },
        ]);
    });

    it("excludes savings (a transfer, not card spend)", async () => {
        const user = await seedUser();
        const groceries = await seedCategory("groceries", true);
        const savings = await seedCategory("savings", true);

        await seedExpense({
            userId: user.id,
            categoryId: groceries.id,
            date: "2026-06-10T12:00:00Z",
            amount: 300,
            actualExpenditure: 300,
        });
        // Savings contribution (null card) — must NOT appear as a Cash segment.
        await seedExpense({
            userId: user.id,
            categoryId: savings.id,
            date: "2026-06-11T12:00:00Z",
            amount: 5000,
            actualExpenditure: 5000,
        });

        const rows = await repo.getCardSpends(user.id, "2026-06");
        expect(rows).toEqual([
            { id: "cash", name: "Cash", color: "#16a34a", spent: 300 },
        ]);
    });
});

describe("PrismaDashboardRepository.getCategoryBreakdown (integration)", () => {
    async function seedSubcategory(categoryId: string, name: string) {
        return db.subcategory.create({ data: { categoryId, name } });
    }

    it("returns budget + spend + N-of-M subcats, excluding Unassigned, high→low", async () => {
        const user = await seedUser();
        const housing = await seedCategory("housing", true, 14000);
        const rent = await seedSubcategory(housing.id, "Rent");
        await seedSubcategory(housing.id, "Mortgage"); // exists, no spend
        const groceries = await seedCategory("groceries", true, 5000);
        const gro = await seedSubcategory(groceries.id, "Groceries");
        const unassigned = await seedCategory("unassigned", false);

        // Housing: two rows, one subcategorized (Rent), one not → 1 of 2 subcats.
        await seedExpense({
            userId: user.id,
            categoryId: housing.id,
            subcategoryId: rent.id,
            date: "2026-06-05T12:00:00Z",
            amount: 8000,
            actualExpenditure: 8000,
        });
        await seedExpense({
            userId: user.id,
            categoryId: housing.id,
            date: "2026-06-06T12:00:00Z",
            amount: 500,
            actualExpenditure: 500,
        });
        await seedExpense({
            userId: user.id,
            categoryId: groceries.id,
            subcategoryId: gro.id,
            date: "2026-06-10T12:00:00Z",
            amount: 3200,
            actualExpenditure: 3200,
        });
        // Unassigned spend — must be excluded from the grid.
        await seedExpense({
            userId: user.id,
            categoryId: unassigned.id,
            date: "2026-06-11T12:00:00Z",
            amount: 999,
            actualExpenditure: 999,
        });

        const rows = await repo.getCategoryBreakdown(user.id, "2026-06");
        expect(rows.map((r) => r.slug)).toEqual(["housing", "groceries"]); // high→low, no unassigned
        expect(rows[0]).toEqual({
            slug: "housing",
            name: "housing",
            color: "#6b7280",
            monthlyBudget: 14000,
            spent: 8500,
            subcatTotal: 2,
            subcatWithSpend: 1,
        });
        expect(rows[1]).toMatchObject({
            slug: "groceries",
            monthlyBudget: 5000,
            spent: 3200,
            subcatTotal: 1,
            subcatWithSpend: 1,
        });
    });

    it("carries a null budget through as null", async () => {
        const user = await seedUser();
        const debt = await seedCategory("debt", true, null);
        await seedExpense({
            userId: user.id,
            categoryId: debt.id,
            date: "2026-06-10T12:00:00Z",
            amount: 900,
            actualExpenditure: 900,
        });

        const [row] = await repo.getCategoryBreakdown(user.id, "2026-06");
        expect(row?.monthlyBudget).toBeNull();
        expect(row?.spent).toBe(900);
    });

    it("resolves the per-month budget override over the default (ADR-0016)", async () => {
        const user = await seedUser();
        const groceries = await seedCategory("groceries", true, 5000); // default
        await db.categoryBudget.create({
            data: { categoryId: groceries.id, month: "2026-06", amount: 6500 },
        });
        // Override for a different month must NOT affect June.
        await db.categoryBudget.create({
            data: { categoryId: groceries.id, month: "2026-05", amount: 1000 },
        });
        await seedExpense({
            userId: user.id,
            categoryId: groceries.id,
            date: "2026-06-10T12:00:00Z",
            amount: 3200,
            actualExpenditure: 3200,
        });

        const [june] = await repo.getCategoryBreakdown(user.id, "2026-06");
        expect(june?.monthlyBudget).toBe(6500); // override wins for June
    });
});
