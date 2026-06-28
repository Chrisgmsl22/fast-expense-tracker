import { describe, it, expect } from "vitest";

import { db } from "@/lib/db";
import { PrismaExpenseRepository } from "@/lib/repositories/expense.repository";

const repo = new PrismaExpenseRepository(db);

// Minimal fixtures for an expense row. Truncation (tests/integration/truncate.ts)
// gives each test a clean database, so ids/emails don't need to be unique across
// tests — only within one.
async function seedUser(email = "u@example.com") {
    return db.user.create({
        data: { email, password: "x", name: "Test" },
    });
}

async function seedCategory(slug = "groceries") {
    return db.category.create({ data: { slug, name: "Groceries" } });
}

async function seedExpense(opts: {
    userId: string;
    categoryId: string;
    date: string;
    description: string;
    amount?: number;
    actualExpenditure?: number;
}) {
    return db.expense.create({
        data: {
            userId: opts.userId,
            categoryId: opts.categoryId,
            date: new Date(opts.date),
            description: opts.description,
            amount: opts.amount ?? 100,
            actualExpenditure: opts.actualExpenditure ?? opts.amount ?? 100,
        },
    });
}

describe("PrismaExpenseRepository.getForMonth (integration)", () => {
    it("returns an empty array for a user with no expenses", async () => {
        const user = await seedUser();
        expect(await repo.getForMonth(user.id, "2026-05")).toEqual([]);
    });

    it("returns only the user's expenses inside the CDMX month, newest first", async () => {
        const user = await seedUser("me@example.com");
        const other = await seedUser("other@example.com");
        const cat = await seedCategory();

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
        expect(res[0]?.category).toEqual({ name: "Groceries" });
        expect(res[0]?.card).toBeNull();
    });

    it("surfaces the stored shared-split fields", async () => {
        const user = await seedUser();
        const cat = await seedCategory();
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
