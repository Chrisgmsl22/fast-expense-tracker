import { describe, it, expect } from "vitest";

import { db } from "@/lib/db";
import { computeFeedTotals } from "@/lib/domain/movement";
import { PrismaDashboardRepository } from "@/lib/repositories/dashboard.repository";
import { PrismaExpenseRepository } from "@/lib/repositories/expense.repository";

const repo = new PrismaExpenseRepository(db);
const dashboardRepo = new PrismaDashboardRepository(db);

// Minimal fixtures for an expense row. Truncation (tests/integration/truncate.ts)
// gives each test a clean database, so ids/emails don't need to be unique across
// tests — only within one.
async function seedUser(email = "u@example.com") {
    return db.user.create({
        data: { email, password: "x", name: "Test" },
    });
}

async function seedCategory(userId: string, slug = "groceries") {
    return db.category.create({ data: { userId, slug, name: "Groceries" } });
}

async function seedExpense(opts: {
    userId: string;
    categoryId: string;
    date: string;
    description: string;
    amount?: number;
    actualExpenditure?: number;
    fundedFrom?: string;
}) {
    return db.expense.create({
        data: {
            userId: opts.userId,
            categoryId: opts.categoryId,
            date: new Date(opts.date),
            description: opts.description,
            amount: opts.amount ?? 100,
            actualExpenditure: opts.actualExpenditure ?? opts.amount ?? 100,
            ...(opts.fundedFrom ? { fundedFrom: opts.fundedFrom } : {}),
        },
    });
}

describe("PrismaExpenseRepository ownership lookups (integration)", () => {
    it("resolves a subcategory's category for its owner and null for anyone else", async () => {
        const me = await seedUser("me@example.com");
        const other = await seedUser("other@example.com");
        const category = await seedCategory(me.id);
        const sub = await db.subcategory.create({
            data: { userId: me.id, categoryId: category.id, name: "Market" },
        });

        expect(await repo.getSubcategoryCategoryId(me.id, sub.id)).toBe(
            category.id,
        );
        expect(await repo.getSubcategoryCategoryId(other.id, sub.id)).toBe(
            null,
        );
    });
});

describe("PrismaExpenseRepository.getForMonth (integration)", () => {
    it("returns an empty array for a user with no expenses", async () => {
        const user = await seedUser();
        expect(await repo.getForMonth(user.id, "2026-05")).toEqual([]);
    });

    it("returns only the user's expenses inside the CDMX month, newest first", async () => {
        const user = await seedUser("me@example.com");
        const other = await seedUser("other@example.com");
        const cat = await seedCategory(user.id);

        await seedExpense({
            userId: user.id,
            categoryId: cat.id,
            date: "2026-05-10T12:00:00Z",
            description: "early may",
        });
        await seedExpense({
            userId: user.id,
            categoryId: cat.id,
            date: "2026-05-20T12:00:00Z",
            description: "late may",
        });
        // Out of month, and another user's row in-month — both excluded.
        await seedExpense({
            userId: user.id,
            categoryId: cat.id,
            date: "2026-04-20T12:00:00Z",
            description: "april",
        });
        await seedExpense({
            userId: other.id,
            categoryId: cat.id,
            date: "2026-05-15T12:00:00Z",
            description: "other user",
        });

        const res = await repo.getForMonth(user.id, "2026-05");

        expect(res.map((e) => e.description)).toEqual([
            "late may",
            "early may",
        ]);
        expect(res[0]?.category.name).toBe("Groceries");
        expect(res[0]?.category.color).toBe("#6b7280"); // schema default
        expect(typeof res[0]?.category.id).toBe("string");
        expect(res[0]?.card).toBeNull();
    });

    it("surfaces the card name + color", async () => {
        const user = await seedUser();
        const cat = await seedCategory(user.id);
        const card = await db.card.create({
            data: {
                userId: user.id,
                name: "BBVA",
                color: "#2563eb",
                type: "debit",
            },
        });
        await db.expense.create({
            data: {
                userId: user.id,
                categoryId: cat.id,
                cardId: card.id,
                date: new Date("2026-05-08T12:00:00Z"),
                description: "with card",
                amount: 100,
                actualExpenditure: 100,
            },
        });

        const [row] = await repo.getForMonth(user.id, "2026-05");
        expect(row?.card).toEqual({ name: "BBVA", color: "#2563eb" });
    });

    it("surfaces the stored shared-split fields", async () => {
        const user = await seedUser();
        const cat = await seedCategory(user.id);
        await seedExpense({
            userId: user.id,
            categoryId: cat.id,
            date: "2026-05-05T12:00:00Z",
            description: "shared dinner",
            amount: 1000,
            actualExpenditure: 680,
        });

        const [row] = await repo.getForMonth(user.id, "2026-05");
        expect(row?.amount).toBe(1000);
        expect(row?.actualExpenditure).toBe(680);
    });
});

describe("an out-of-band funding value read through getForMonth (integration)", () => {
    async function seedMonth() {
        const user = await seedUser();
        const cat = await seedCategory(user.id, "shopping");
        const rows: [string, number, string | undefined][] = [
            ["income row", 1000, undefined],
            ["savings row", 300, "savings"],
            // Not a value the app writes: only a raw database edit puts it here.
            ["cash-back row", 450, "cash-back"],
        ];
        for (const [description, amount, fundedFrom] of rows) {
            await seedExpense({
                userId: user.id,
                categoryId: cat.id,
                date: "2026-05-10T12:00:00Z",
                description,
                amount,
                fundedFrom,
            });
        }
        return user;
    }

    it("flags the budget verdict from the raw column, not the narrowed value", async () => {
        const user = await seedMonth();

        const rows = await repo.getForMonth(user.id, "2026-05");
        const byDescription = new Map(rows.map((r) => [r.description, r]));

        expect(byDescription.get("income row")!.countedInBudget).toBe(true);
        expect(byDescription.get("savings row")!.countedInBudget).toBe(false);
        const outOfBand = byDescription.get("cash-back row")!;
        expect(outOfBand.fundedFrom).toBe("income");
        expect(outOfBand.countedInBudget).toBe(false);
    });

    it("gives the feed totals the same budget figure the dashboard's SQL reads", async () => {
        const user = await seedMonth();

        const totals = computeFeedTotals(
            await repo.getForMonth(user.id, "2026-05"),
        );
        const categorySpends = await dashboardRepo.getCategorySpends(
            user.id,
            "2026-05",
        );
        const nonIncome = await dashboardRepo.getNonIncomeFundedTotal(
            user.id,
            "2026-05",
        );

        expect(totals.whatIReallySpent.amount).toBe(1000);
        expect(totals.whatIReallySpent.amount).toBe(
            categorySpends.reduce((sum, c) => sum + c.spent, 0),
        );
        expect(totals.notFromIncome.amount).toBe(300 + 450);
        expect(totals.notFromIncome.amount).toBe(nonIncome);
    });
});
