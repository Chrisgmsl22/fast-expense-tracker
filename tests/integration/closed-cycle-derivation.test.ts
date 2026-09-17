import { describe, it, expect } from "vitest";

import { db } from "@/lib/db";
import { PrismaExpenseRepository } from "@/lib/repositories/expense.repository";
import { PrismaMovementRepository } from "@/lib/repositories/movement.repository";

/**
 * Which cycle owns a row, against a real database. The choice is pure
 * (`cycleCloseAtOrAfter`); only a database confirms the marker query is
 * user-scoped, `createdAt` is the real insert time, and both read paths agree.
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

/** A transfer carrying a cycle marker — the only movement that may (spec 0007 §3.5). */
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

/**
 * The other marker: a payment-expense that closed a cycle. Only a payment may carry
 * one, and it is entered before the close it holds.
 */
async function seedPaymentClose(
    userId: string,
    categoryId: string,
    closedAt: Date,
    createdAt: Date,
) {
    return db.expense.create({
        data: {
            userId,
            categoryId,
            date: closedAt,
            description: "Transfer — you paid Brenda",
            amount: 500,
            actualExpenditure: 500,
            isPartnerPayment: true,
            createdAt,
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
 * The marker has two homes now. A cycle squared by paying the partner is closed on the
 * payment-EXPENSE, so the close set is the union of the two tables (spec 0007 §6b).
 */
describe("closed-cycle derivation from an expense marker (integration)", () => {
    it("freezes a row entered before a cycle closed on a payment-expense", async () => {
        const user = await seedUser();
        const cat = await seedCategory(user.id);
        await seedPaymentClose(user.id, cat.id, MAY_20, MAY_10);
        const row = await seedExpense({
            userId: user.id,
            categoryId: cat.id,
            description: "before the payment close",
            createdAt: MAY_10,
        });

        const editable = await repo.getById(user.id, row.id);

        expect(editable?.cycleClosedAt?.toISOString()).toBe(
            MAY_20.toISOString(),
        );
    });

    it("places the marker-carrying payment inside the cycle it closed", async () => {
        // This is what makes the existing `cycle_closed` refusal cover the marker:
        // deleting it would dissolve the boundary, so the row must read as frozen.
        const user = await seedUser();
        const cat = await seedCategory(user.id);
        const payment = await seedPaymentClose(user.id, cat.id, MAY_20, MAY_10);

        const editable = await repo.getById(user.id, payment.id);

        expect(editable?.isPartnerPayment).toBe(true);
        expect(editable?.cycleClosedAt?.toISOString()).toBe(
            MAY_20.toISOString(),
        );
    });

    it("leaves a row entered after the payment close in the open cycle", async () => {
        const user = await seedUser();
        const cat = await seedCategory(user.id);
        await seedPaymentClose(user.id, cat.id, MAY_10, MAY_10);
        const row = await seedExpense({
            userId: user.id,
            categoryId: cat.id,
            description: "after the payment close",
            createdAt: MAY_20,
        });

        const editable = await repo.getById(user.id, row.id);

        expect(editable?.cycleClosedAt).toBeNull();
    });

    it("never reads another user's payment close", async () => {
        const user = await seedUser("me@example.com");
        const other = await seedUser("other@example.com");
        const cat = await seedCategory(user.id);
        const otherCat = await seedCategory(other.id);
        await seedPaymentClose(other.id, otherCat.id, MAY_20, MAY_10);
        const row = await seedExpense({
            userId: user.id,
            categoryId: cat.id,
            description: "mine",
            createdAt: MAY_10,
        });

        const editable = await repo.getById(user.id, row.id);

        expect(editable?.cycleClosedAt).toBeNull();
    });

    it("freezes a MOVEMENT too — the close set spans both tables", async () => {
        const user = await seedUser();
        const cat = await seedCategory(user.id);
        await seedPaymentClose(user.id, cat.id, MAY_20, MAY_10);
        const debt = await db.movement.create({
            data: {
                userId: user.id,
                date: new Date("2026-05-15T12:00:00Z"),
                amount: 220,
                type: "gf_fronted",
                createdAt: MAY_10,
            },
        });

        const editable = await movementRepo.getById(user.id, debt.id);

        expect(editable?.cycleClosedAt?.toISOString()).toBe(
            MAY_20.toISOString(),
        );
    });

    it("takes the earliest close at or after the row, whichever table it is in", async () => {
        const user = await seedUser();
        const cat = await seedCategory(user.id);
        // A movement close in May 30 and an expense close in May 20: the row entered
        // on May 10 belongs to the FIRST one at or after it.
        await seedClose(user.id, MAY_30);
        await seedPaymentClose(user.id, cat.id, MAY_20, MAY_10);
        const row = await seedExpense({
            userId: user.id,
            categoryId: cat.id,
            description: "between two closes in two tables",
            createdAt: MAY_10,
        });

        const editable = await repo.getById(user.id, row.id);

        expect(editable?.cycleClosedAt?.toISOString()).toBe(
            MAY_20.toISOString(),
        );
    });
});

/**
 * The same derivation for a MOVEMENT. The DB CHECK allows `closedAt` only on a
 * transfer, so a debt needs the `createdAt`-against-the-closes derivation too.
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
