import { describe, it, expect } from "vitest";

import { db } from "@/lib/db";
import { PrismaExpenseRepository } from "@/lib/repositories/expense.repository";
import { PrismaMovementRepository } from "@/lib/repositories/movement.repository";

/**
 * Which cycle owns an expense, against a real database.
 *
 * An expense has no marker column: its cycle is its `createdAt` measured against
 * the close instants filed on `Movement.closedAt`. The choice itself is pure
 * (`cycleCloseAtOrAfter`, unit-tested with plain Dates); what only a database
 * can confirm is the part around it — that the marker query reads this user's
 * closes and nobody else's, that `createdAt` comes back as the real insert time,
 * and that both read paths (`getById`, `getForMonth`) answer the same.
 */
const repo = new PrismaExpenseRepository(db);
const movementRepo = new PrismaMovementRepository(db);

async function seedUser(email = "u@example.com") {
    return db.user.create({ data: { email, password: "x", name: "Test" } });
}

async function seedCategory(userId: string, slug = "groceries") {
    return db.category.create({ data: { userId, slug, name: "Groceries" } });
}

async function seedExpense(opts: {
    userId: string;
    categoryId: string;
    description: string;
    createdAt: Date;
    amount?: number;
    actualExpenditure?: number;
}) {
    return db.expense.create({
        data: {
            userId: opts.userId,
            categoryId: opts.categoryId,
            date: new Date("2026-05-15T12:00:00Z"),
            description: opts.description,
            amount: opts.amount ?? 1000,
            actualExpenditure: opts.actualExpenditure ?? 680,
            // `createdAt` has a default, so it is written explicitly here: the
            // whole derivation hangs off it.
            createdAt: opts.createdAt,
        },
    });
}

/** A transfer carrying a cycle marker — only a transfer may (spec 0007 §3.5). */
async function seedClose(userId: string, closedAt: Date) {
    return db.movement.create({
        data: {
            userId,
            date: closedAt,
            amount: 500,
            type: "gf_paid",
            closedAt,
        },
    });
}

const MAY_10 = new Date("2026-05-10T00:00:00Z");
const MAY_20 = new Date("2026-05-20T00:00:00Z");
const MAY_30 = new Date("2026-05-30T00:00:00Z");

describe("closed-cycle derivation (integration)", () => {
    it("has no close for a row entered after the last one", async () => {
        const user = await seedUser();
        const cat = await seedCategory(user.id);
        await seedClose(user.id, MAY_10);
        const row = await seedExpense({
            userId: user.id,
            categoryId: cat.id,
            description: "after the close",
            createdAt: MAY_20,
        });

        const editable = await repo.getById(user.id, row.id);

        expect(editable?.cycleClosedAt).toBeNull();
    });

    it("takes the FIRST close at or after the row was entered", async () => {
        const user = await seedUser();
        const cat = await seedCategory(user.id);
        await seedClose(user.id, MAY_30);
        await seedClose(user.id, MAY_20);
        const row = await seedExpense({
            userId: user.id,
            categoryId: cat.id,
            description: "between the closes",
            createdAt: MAY_10,
        });

        const editable = await repo.getById(user.id, row.id);

        expect(editable?.cycleClosedAt?.toISOString()).toBe(
            MAY_20.toISOString(),
        );
    });

    it("counts a row entered at the exact close instant as inside that cycle", async () => {
        const user = await seedUser();
        const cat = await seedCategory(user.id);
        await seedClose(user.id, MAY_20);
        const row = await seedExpense({
            userId: user.id,
            categoryId: cat.id,
            description: "on the boundary",
            createdAt: MAY_20,
        });

        const editable = await repo.getById(user.id, row.id);

        expect(editable?.cycleClosedAt?.toISOString()).toBe(
            MAY_20.toISOString(),
        );
    });

    it("never reads another user's close", async () => {
        const user = await seedUser("me@example.com");
        const other = await seedUser("other@example.com");
        const cat = await seedCategory(user.id);
        await seedClose(other.id, MAY_20);
        const row = await seedExpense({
            userId: user.id,
            categoryId: cat.id,
            description: "mine",
            createdAt: MAY_10,
        });

        const editable = await repo.getById(user.id, row.id);

        expect(editable?.cycleClosedAt).toBeNull();
    });

    it("ignores a transfer that carries no marker", async () => {
        const user = await seedUser();
        const cat = await seedCategory(user.id);
        await db.movement.create({
            data: {
                userId: user.id,
                date: MAY_20,
                amount: 500,
                type: "gf_paid",
            },
        });
        const row = await seedExpense({
            userId: user.id,
            categoryId: cat.id,
            description: "open cycle",
            createdAt: MAY_10,
        });

        const editable = await repo.getById(user.id, row.id);

        expect(editable?.cycleClosedAt).toBeNull();
    });

    it("gives the list the same answer as the edit read, row by row", async () => {
        const user = await seedUser();
        const cat = await seedCategory(user.id);
        await seedClose(user.id, MAY_20);
        await seedExpense({
            userId: user.id,
            categoryId: cat.id,
            description: "frozen",
            createdAt: MAY_10,
        });
        await seedExpense({
            userId: user.id,
            categoryId: cat.id,
            description: "open",
            createdAt: MAY_30,
        });

        const list = await repo.getForMonth(user.id, "2026-05");

        const byDescription = new Map(list.map((e) => [e.description, e]));
        expect(byDescription.get("frozen")?.cycleClosedAt?.toISOString()).toBe(
            MAY_20.toISOString(),
        );
        expect(byDescription.get("open")?.cycleClosedAt).toBeNull();
        for (const row of list) {
            const editable = await repo.getById(user.id, row.id);
            expect(editable?.cycleClosedAt?.toISOString() ?? null).toBe(
                row.cycleClosedAt?.toISOString() ?? null,
            );
        }
    });

    it("returns the stored share, so the guard reads the same number settlement sums", async () => {
        const user = await seedUser();
        const cat = await seedCategory(user.id);
        const row = await seedExpense({
            userId: user.id,
            categoryId: cat.id,
            description: "shared",
            createdAt: MAY_10,
            amount: 1000,
            actualExpenditure: 680,
        });

        const editable = await repo.getById(user.id, row.id);

        expect(editable?.actualExpenditure).toBe(680);
    });
});

/**
 * The same derivation for a MOVEMENT — the half that was missing.
 *
 * `Movement.closedAt` is the cycle's MARKER, and the DB CHECK allows it only on
 * a transfer. So a `gf_fronted` debt can never carry one, and the write scope
 * `closedAt: null` never blocked a debt: closing a cycle and then deleting a
 * debt inside it succeeded, and restated that filed cycle's figure. A movement
 * needs the same `createdAt`-against-the-closes derivation an expense uses.
 */
describe("closed-cycle derivation for movements (integration)", () => {
    async function seedDebt(userId: string, createdAt: Date) {
        return db.movement.create({
            data: {
                userId,
                date: new Date("2026-05-15T12:00:00Z"),
                amount: 220,
                type: "gf_fronted",
                note: "she covered the vet",
                createdAt,
            },
        });
    }

    it("places a debt in the cycle that closed after it, though it carries no marker", async () => {
        const user = await seedUser();
        await seedClose(user.id, MAY_20);
        const debt = await seedDebt(user.id, MAY_10);

        const editable = await movementRepo.getById(user.id, debt.id);

        // The marker column is empty, as the CHECK requires…
        expect(editable?.closedAt).toBeNull();
        // …and the row is frozen all the same.
        expect(editable?.cycleClosedAt?.toISOString()).toBe(
            MAY_20.toISOString(),
        );
    });

    it("leaves a debt entered after the last close in the open cycle", async () => {
        const user = await seedUser();
        await seedClose(user.id, MAY_10);
        const debt = await seedDebt(user.id, MAY_20);

        const editable = await movementRepo.getById(user.id, debt.id);

        expect(editable?.cycleClosedAt).toBeNull();
    });

    it("never reads another user's close", async () => {
        const user = await seedUser("me@example.com");
        const other = await seedUser("other@example.com");
        await seedClose(other.id, MAY_20);
        const debt = await seedDebt(user.id, MAY_10);

        const editable = await movementRepo.getById(user.id, debt.id);

        expect(editable?.cycleClosedAt).toBeNull();
    });

    it("gives the month feed the same answer as the edit read", async () => {
        const user = await seedUser();
        // The marker itself: entered before the close it carries, so it is
        // inside the cycle it closed and holds both facts. `getForMonth` drops
        // `gf_fronted`, so the transfer is what this list path can check.
        const marker = await db.movement.create({
            data: {
                userId: user.id,
                date: MAY_20,
                amount: 500,
                type: "gf_paid",
                createdAt: MAY_10,
                closedAt: MAY_20,
            },
        });

        const list = await movementRepo.getForMonth(user.id, "2026-05");

        const row = list.find((m) => m.id === marker.id);
        expect(row?.closedAt?.toISOString()).toBe(MAY_20.toISOString());
        expect(row?.cycleClosedAt?.toISOString()).toBe(MAY_20.toISOString());
        const editable = await movementRepo.getById(user.id, marker.id);
        expect(editable?.cycleClosedAt?.toISOString() ?? null).toBe(
            row?.cycleClosedAt?.toISOString() ?? null,
        );
    });
});
