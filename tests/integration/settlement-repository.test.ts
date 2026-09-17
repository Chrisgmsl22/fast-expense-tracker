import { describe, it, expect } from "vitest";

import { db } from "@/lib/db";
import { PrismaMovementRepository } from "@/lib/repositories/movement.repository";
import { PrismaSettlementRepository } from "@/lib/repositories/settlement.repository";

const repo = new PrismaSettlementRepository(db);

// June + July window (CDMX midnight = 06:00Z), matching getSettlement's rolling
// current+previous-month range.
const WINDOW_START = new Date("2026-06-01T06:00:00Z");
const WINDOW_END = new Date("2026-08-01T06:00:00Z");

async function seedUser(email = "u@example.com") {
    return db.user.create({ data: { email, password: "x", name: "Test" } });
}

async function seedCategory(userId: string, slug = "groceries") {
    return db.category.create({
        data: { userId, slug, name: slug, isRelevant: true },
    });
}

describe("PrismaSettlementRepository.getForWindow (integration)", () => {
    it("returns empty arrays for a window with nothing in it", async () => {
        const user = await seedUser();
        expect(
            await repo.getForWindow(user.id, WINDOW_START, WINDOW_END),
        ).toEqual({ expenses: [], movements: [] });
    });

    it("returns in-window expenses and movements (debt is a gf_fronted movement)", async () => {
        const user = await seedUser();
        const cat = await seedCategory(user.id);

        await db.expense.create({
            data: {
                userId: user.id,
                categoryId: cat.id,
                date: new Date("2026-07-10T06:00:00Z"),
                description: "Groceries",
                amount: 1000,
                actualExpenditure: 680,
                isShared: true,
            },
        });
        // The "I owe Brenda" debt is now a movement, not an expense (ADR-0020).
        await db.movement.create({
            data: {
                userId: user.id,
                date: new Date("2026-06-20T06:00:00Z"),
                amount: 300,
                type: "gf_fronted",
                note: "I owe Brenda",
            },
        });
        await db.movement.create({
            data: {
                userId: user.id,
                date: new Date("2026-07-05T06:00:00Z"),
                amount: 320,
                type: "gf_received",
            },
        });

        const rows = await repo.getForWindow(user.id, WINDOW_START, WINDOW_END);
        expect(rows.expenses).toHaveLength(1);
        expect(rows.movements).toHaveLength(2);
        const debt = rows.movements.find((m) => m.type === "gf_fronted");
        expect(debt).toMatchObject({ amount: 300, note: "I owe Brenda" });
        expect(rows.movements.some((m) => m.type === "gf_received")).toBe(true);
    });

    it("excludes rows outside the window and other users' rows", async () => {
        const user = await seedUser("me@example.com");
        const other = await seedUser("other@example.com");
        const cat = await seedCategory(user.id);

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

    it("returns a savings-funded transfer at full value (spec 0007 §6a)", async () => {
        // The other ledger. The feed drops this transfer from the budget and
        // cash figures, but the money really did reach her, so the settlement
        // read must still see it — and see it whole, not reduced.
        const user = await seedUser();
        await db.movement.create({
            data: {
                userId: user.id,
                date: new Date("2026-07-05T06:00:00Z"),
                amount: 8000,
                type: "gf_paid",
                fundedFrom: "savings",
            },
        });

        const rows = await repo.getForWindow(user.id, WINDOW_START, WINDOW_END);
        expect(rows.movements).toHaveLength(1);
        expect(rows.movements[0]).toMatchObject({
            type: "gf_paid",
            amount: 8000,
            fundedFrom: "savings",
        });
    });
});

describe("PrismaSettlementRepository cycles (integration)", () => {
    it("selects rows by entry time, not by date", async () => {
        const user = await seedUser("cycles@example.com");
        const cat = await seedCategory(user.id);
        // Both rows are created now; only their dates differ. An old-dated row
        // entered now must still fall inside a range that starts before now.
        await db.expense.create({
            data: {
                userId: user.id,
                categoryId: cat.id,
                date: new Date("2025-01-10T06:00:00Z"),
                description: "Entered late",
                amount: 1000,
                actualExpenditure: 680,
                isShared: true,
            },
        });

        const before = new Date(Date.now() - 60_000);
        const rows = await repo.getForCreatedRange(user.id, before, null);
        expect(rows.expenses.map((e) => e.description)).toEqual([
            "Entered late",
        ]);

        // A range that ends before the row was entered excludes it, even though
        // its DATE is far older than that boundary.
        const empty = await repo.getForCreatedRange(user.id, null, before);
        expect(empty.expenses).toEqual([]);
    });

    it("marks a transfer as the cycle close, once, and lists it as a marker", async () => {
        const user = await seedUser("marker@example.com");
        const transfer = await db.movement.create({
            data: {
                userId: user.id,
                date: new Date("2026-07-05T06:00:00Z"),
                amount: 320,
                type: "gf_received",
            },
        });

        const closedAt = new Date("2026-07-06T18:30:00Z");
        expect(await repo.markCycleClose(user.id, transfer.id, closedAt)).toBe(
            1,
        );
        // A double submit matches nothing the second time — no second marker.
        expect(
            await repo.markCycleClose(user.id, transfer.id, new Date()),
        ).toBe(0);

        const markers = await repo.getCycleMarkers(user.id);
        expect(markers).toHaveLength(1);
        // The boundary stored is the close instant, not the transfer's own date
        // or entry time.
        expect(markers[0]).toMatchObject({
            id: transfer.id,
            amount: 320,
            closedAt,
        });
    });

    it("freezes the marker: it can't be edited or deleted through the movement repository", async () => {
        const user = await seedUser("frozen@example.com");
        const transfer = await db.movement.create({
            data: {
                userId: user.id,
                date: new Date("2026-07-05T06:00:00Z"),
                amount: 320,
                type: "gf_received",
            },
        });
        await repo.markCycleClose(user.id, transfer.id, new Date());

        const movements = new PrismaMovementRepository(db);
        expect(
            await movements.updateForUser(transfer.id, user.id, {
                date: new Date("2026-07-05T06:00:00Z"),
                amount: 999,
                type: "gf_paid",
                cardId: null,
                note: null,
            }),
        ).toBe(0);
        expect(await movements.deleteForUser(user.id, transfer.id)).toBe(0);

        const still = await movements.getById(user.id, transfer.id);
        expect(still).toMatchObject({ amount: 320, type: "gf_received" });
        expect(still?.closedAt).not.toBeNull();
    });

    it("refuses the marker on a movement that isn't a transfer", async () => {
        const user = await seedUser("nonmarker@example.com");
        const debt = await db.movement.create({
            data: {
                userId: user.id,
                date: new Date("2026-07-05T06:00:00Z"),
                amount: 300,
                type: "gf_fronted",
            },
        });

        expect(await repo.markCycleClose(user.id, debt.id, new Date())).toBe(0);
        expect(await repo.getCycleMarkers(user.id)).toEqual([]);
        // The DB CHECK backs the query guard on create AND update.
        await expect(
            db.movement.update({
                where: { id: debt.id },
                data: { closedAt: new Date() },
            }),
        ).rejects.toThrow();
    });

    it("never marks another user's transfer", async () => {
        const user = await seedUser("owner@example.com");
        const other = await seedUser("intruder@example.com");
        const transfer = await db.movement.create({
            data: {
                userId: user.id,
                date: new Date("2026-07-05T06:00:00Z"),
                amount: 100,
                type: "gf_paid",
            },
        });

        expect(
            await repo.markCycleClose(other.id, transfer.id, new Date()),
        ).toBe(0);
        expect(await repo.getCycleMarkers(user.id)).toEqual([]);
    });
});
