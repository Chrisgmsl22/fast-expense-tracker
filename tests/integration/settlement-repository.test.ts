import { describe, it, expect } from "vitest";

import { db } from "@/lib/db";
import { PrismaSettlementRepository } from "@/lib/repositories/settlement.repository";

const repo = new PrismaSettlementRepository(db);

// June + July window (CDMX midnight = 06:00Z), matching getSettlement's rolling
// current+previous-month range.
const WINDOW_START = new Date("2026-06-01T06:00:00Z");
const WINDOW_END = new Date("2026-08-01T06:00:00Z");

async function seedUser(email = "u@example.com") {
    return db.user.create({ data: { email, password: "x", name: "Test" } });
}

async function seedCategory(slug = "groceries") {
    return db.category.create({ data: { slug, name: slug, isRelevant: true } });
}

describe("PrismaSettlementRepository.getForWindow (integration)", () => {
    it("returns empty arrays for a window with nothing in it", async () => {
        const user = await seedUser();
        expect(
            await repo.getForWindow(user.id, WINDOW_START, WINDOW_END),
        ).toEqual({ expenses: [], movements: [] });
    });

    it("returns in-window expenses (with paidBy) and movements (with fundedByPartner)", async () => {
        const user = await seedUser();
        const cat = await seedCategory();

        await db.expense.create({
            data: {
                userId: user.id,
                categoryId: cat.id,
                date: new Date("2026-07-10T06:00:00Z"),
                description: "Groceries",
                amount: 1000,
                actualExpenditure: 680,
                isShared: true,
                paidBy: "you",
            },
        });
        await db.expense.create({
            data: {
                userId: user.id,
                categoryId: cat.id,
                date: new Date("2026-06-20T06:00:00Z"),
                description: "I owe Brenda",
                amount: 300,
                actualExpenditure: 300,
                isShared: false,
                paidBy: "gf",
            },
        });
        await db.movement.create({
            data: {
                userId: user.id,
                date: new Date("2026-07-05T06:00:00Z"),
                amount: 320,
                type: "card_payment",
                fundedByPartner: true,
            },
        });

        const rows = await repo.getForWindow(user.id, WINDOW_START, WINDOW_END);
        expect(rows.expenses).toHaveLength(2);
        const debt = rows.expenses.find((e) => e.paidBy === "gf");
        expect(debt?.actualExpenditure).toBe(300);
        expect(rows.movements).toHaveLength(1);
        expect(rows.movements[0]).toMatchObject({
            type: "card_payment",
            amount: 320,
            fundedByPartner: true,
        });
    });

    it("excludes rows outside the window and other users' rows", async () => {
        const user = await seedUser("me@example.com");
        const other = await seedUser("other@example.com");
        const cat = await seedCategory();

        // Out of window (May, August) + another user's in-window row.
        await db.expense.create({
            data: {
                userId: user.id,
                categoryId: cat.id,
                date: new Date("2026-05-20T06:00:00Z"),
                description: "May",
                amount: 999,
                actualExpenditure: 999,
            },
        });
        await db.movement.create({
            data: {
                userId: user.id,
                date: new Date("2026-08-02T06:00:00Z"),
                amount: 50,
                type: "gf_paid",
                fundedByPartner: false,
            },
        });
        await db.expense.create({
            data: {
                userId: other.id,
                categoryId: cat.id,
                date: new Date("2026-07-01T06:00:00Z"),
                description: "Other user",
                amount: 100,
                actualExpenditure: 100,
            },
        });

        const rows = await repo.getForWindow(user.id, WINDOW_START, WINDOW_END);
        expect(rows).toEqual({ expenses: [], movements: [] });
    });
});
