import type { PrismaClient } from "@prisma/client";
import { describe, it, expect } from "vitest";

import { db } from "@/lib/db";
import { PrismaIncomeRepository } from "@/lib/repositories/income.repository";

const repo = new PrismaIncomeRepository(db);

async function seedUser(email = "u@example.com") {
    return db.user.create({ data: { email, password: "x", name: "Test" } });
}

async function seedFixed(
    userId: string,
    rows: Array<{ effectiveMonth: string | null; amount: number }>,
) {
    for (const row of rows) {
        await db.income.create({ data: { userId, type: "FIXED", ...row } });
    }
}

async function fixedByMonth(userId: string, months: string[]) {
    const out: Record<string, number> = {};
    for (const month of months) {
        out[month] = (await repo.getMonthlySummary(userId, month)).fixed;
    }
    return out;
}

// Month order, not insert order: rows written in one call can share a millisecond.
async function fixedRows(userId: string) {
    return db.income.findMany({
        where: { userId, type: "FIXED" },
        orderBy: [
            { effectiveMonth: { sort: "asc", nulls: "first" } },
            { createdAt: "asc" },
        ],
        select: { effectiveMonth: true, amount: true },
    });
}

const MONTHS = [
    "2026-04",
    "2026-05",
    "2026-06",
    "2026-07",
    "2026-09",
    "2027-02",
];

// Guards: the method is new, so every case fails pre-fix (no method).
describe("PrismaIncomeRepository.setFixedForMonthOnly (integration)", () => {
    it("Should change only the edited month over a legacy null base", async () => {
        const user = await seedUser();
        await seedFixed(user.id, [{ effectiveMonth: null, amount: 40000 }]);

        await repo.setFixedForMonthOnly(user.id, "2026-05", 45000);

        expect(await fixedByMonth(user.id, MONTHS)).toEqual({
            "2026-04": 40000,
            "2026-05": 45000,
            "2026-06": 40000,
            "2026-07": 40000,
            "2026-09": 40000,
            "2027-02": 40000,
        });
    });

    it("Should change only the edited month over dated rows", async () => {
        const user = await seedUser();
        await seedFixed(user.id, [
            { effectiveMonth: "2026-03", amount: 40000 },
            { effectiveMonth: "2026-07", amount: 50000 },
        ]);

        await repo.setFixedForMonthOnly(user.id, "2026-05", 45000);

        expect(await fixedByMonth(user.id, MONTHS)).toEqual({
            "2026-04": 40000,
            "2026-05": 45000,
            "2026-06": 40000,
            "2026-07": 50000,
            "2026-09": 50000,
            "2027-02": 50000,
        });
    });

    it("Should update the month's own row and hold the next month at its old amount", async () => {
        const user = await seedUser();
        await seedFixed(user.id, [
            { effectiveMonth: null, amount: 40000 },
            { effectiveMonth: "2026-05", amount: 42000 },
        ]);

        await repo.setFixedForMonthOnly(user.id, "2026-05", 45000);

        expect(await fixedByMonth(user.id, MONTHS)).toEqual({
            "2026-04": 40000,
            "2026-05": 45000,
            "2026-06": 42000,
            "2026-07": 42000,
            "2026-09": 42000,
            "2027-02": 42000,
        });
        expect(await fixedRows(user.id)).toEqual([
            { effectiveMonth: null, amount: 40000 },
            { effectiveMonth: "2026-05", amount: 45000 },
            { effectiveMonth: "2026-06", amount: 42000 },
        ]);
    });

    it("Should create no carry-forward row when the next month has its own", async () => {
        const user = await seedUser();
        await seedFixed(user.id, [
            { effectiveMonth: null, amount: 40000 },
            { effectiveMonth: "2026-06", amount: 50000 },
        ]);

        await repo.setFixedForMonthOnly(user.id, "2026-05", 45000);

        expect(await fixedByMonth(user.id, MONTHS)).toEqual({
            "2026-04": 40000,
            "2026-05": 45000,
            "2026-06": 50000,
            "2026-07": 50000,
            "2026-09": 50000,
            "2027-02": 50000,
        });
        expect(await fixedRows(user.id)).toEqual([
            { effectiveMonth: null, amount: 40000 },
            { effectiveMonth: "2026-05", amount: 45000 },
            { effectiveMonth: "2026-06", amount: 50000 },
        ]);
    });

    it("Should keep an edited month when the month before it is edited next", async () => {
        const user = await seedUser();
        await seedFixed(user.id, [{ effectiveMonth: null, amount: 40000 }]);

        await repo.setFixedForMonthOnly(user.id, "2026-05", 45000);
        await repo.setFixedForMonthOnly(user.id, "2026-04", 43000);

        expect(await fixedByMonth(user.id, ["2026-03", ...MONTHS])).toEqual({
            "2026-03": 40000,
            "2026-04": 43000,
            "2026-05": 45000,
            "2026-06": 40000,
            "2026-07": 40000,
            "2026-09": 40000,
            "2027-02": 40000,
        });
        expect(await fixedRows(user.id)).toEqual([
            { effectiveMonth: null, amount: 40000 },
            { effectiveMonth: "2026-04", amount: 43000 },
            { effectiveMonth: "2026-05", amount: 45000 },
            { effectiveMonth: "2026-06", amount: 40000 },
        ]);
    });

    it("Should leave one row for the month after two edits of it", async () => {
        const user = await seedUser();
        await seedFixed(user.id, [{ effectiveMonth: null, amount: 40000 }]);

        await repo.setFixedForMonthOnly(user.id, "2026-05", 45000);
        await repo.setFixedForMonthOnly(user.id, "2026-05", 46000);

        expect(await fixedRows(user.id)).toEqual([
            { effectiveMonth: null, amount: 40000 },
            { effectiveMonth: "2026-05", amount: 46000 },
            { effectiveMonth: "2026-06", amount: 40000 },
        ]);
        expect((await repo.getMonthlySummary(user.id, "2026-06")).fixed).toBe(
            40000,
        );
    });

    it("Should roll back the month's row when the carry-forward write fails", async () => {
        const user = await seedUser();
        await seedFixed(user.id, [{ effectiveMonth: null, amount: 40000 }]);
        const failing = db.$extends({
            query: {
                income: {
                    async create({ args, query }) {
                        if (args.data.effectiveMonth === "2026-06") {
                            throw new Error("test: carry-forward write failed");
                        }
                        return query(args);
                    },
                },
            },
        });
        // The extended client keeps the PrismaClient API the adapter uses.
        const failingRepo = new PrismaIncomeRepository(
            failing as unknown as PrismaClient,
        );

        await expect(
            failingRepo.setFixedForMonthOnly(user.id, "2026-05", 45000),
        ).rejects.toThrow("test: carry-forward write failed");

        expect(await fixedRows(user.id)).toEqual([
            { effectiveMonth: null, amount: 40000 },
        ]);
    });

    it("Should scope reads and writes by userId", async () => {
        const me = await seedUser("me@example.com");
        const other = await seedUser("other@example.com");
        await seedFixed(me.id, [{ effectiveMonth: null, amount: 40000 }]);
        await seedFixed(other.id, [
            { effectiveMonth: null, amount: 90000 },
            { effectiveMonth: "2026-06", amount: 95000 },
        ]);

        await repo.setFixedForMonthOnly(me.id, "2026-05", 45000);

        expect(await fixedRows(me.id)).toEqual([
            { effectiveMonth: null, amount: 40000 },
            { effectiveMonth: "2026-05", amount: 45000 },
            { effectiveMonth: "2026-06", amount: 40000 },
        ]);
        expect(await fixedRows(other.id)).toEqual([
            { effectiveMonth: null, amount: 90000 },
            { effectiveMonth: "2026-06", amount: 95000 },
        ]);
    });
});
