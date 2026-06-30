import { describe, it, expect } from "vitest";

import { db } from "@/lib/db";
import { PrismaIncomeRepository } from "@/lib/repositories/income.repository";

const repo = new PrismaIncomeRepository(db);

// Truncation (tests/integration/truncate.ts) gives each test a clean database,
// so emails don't need to be unique across tests — only within one.
async function seedUser(email = "u@example.com") {
    return db.user.create({ data: { email, password: "x", name: "Test" } });
}

describe("PrismaIncomeRepository (integration)", () => {
    it("getMonthlySummary returns zeros for a user with no income", async () => {
        const user = await seedUser();
        expect(await repo.getMonthlySummary(user.id, "2026-06")).toEqual({
            fixed: 0,
            variable: 0,
            total: 0,
        });
    });

    it("getMonthlySummary sums fixed + the month's variable, scoped to user + month", async () => {
        const user = await seedUser("me@example.com");
        const other = await seedUser("other@example.com");
        await repo.setFixed(user.id, 44000);
        await repo.insertVariable(user.id, {
            date: new Date("2026-06-10T06:00:00Z"),
            source: "Freelance",
            amount: 3000,
        });
        await repo.insertVariable(user.id, {
            date: new Date("2026-06-18T06:00:00Z"),
            source: "Sneakers",
            amount: 1200,
        });
        // Out of month, and another user's in-month variable — both excluded.
        await repo.insertVariable(user.id, {
            date: new Date("2026-05-20T06:00:00Z"),
            source: "May gig",
            amount: 9999,
        });
        await repo.setFixed(other.id, 10000);
        await repo.insertVariable(other.id, {
            date: new Date("2026-06-15T06:00:00Z"),
            source: "Not mine",
            amount: 5000,
        });

        const summary = await repo.getMonthlySummary(user.id, "2026-06");
        expect(summary).toEqual({ fixed: 44000, variable: 4200, total: 48200 });
    });

    it("getVariableForMonth returns the user's in-month rows, newest first", async () => {
        const user = await seedUser();
        await repo.insertVariable(user.id, {
            date: new Date("2026-06-10T06:00:00Z"),
            source: "early",
            amount: 100,
        });
        await repo.insertVariable(user.id, {
            date: new Date("2026-06-20T06:00:00Z"),
            source: "late",
            amount: 200,
        });

        const rows = await repo.getVariableForMonth(user.id, "2026-06");
        expect(rows.map((r) => r.source)).toEqual(["late", "early"]);
        expect(rows[0]?.amount).toBe(200);
    });

    it("setFixed upserts a single FIXED row (create then update)", async () => {
        const user = await seedUser();
        await repo.setFixed(user.id, 40000);
        await repo.setFixed(user.id, 50000);

        const rows = await db.income.findMany({
            where: { userId: user.id, type: "FIXED" },
        });
        expect(rows).toHaveLength(1);
        expect(rows[0]?.amount).toBe(50000);
    });

    it("deleteVariableForUser removes an owned row and reports the count", async () => {
        const user = await seedUser();
        const { id } = await repo.insertVariable(user.id, {
            date: new Date("2026-06-10T06:00:00Z"),
            source: "to delete",
            amount: 100,
        });

        expect(await repo.deleteVariableForUser(id, user.id)).toBe(1);
        expect(await repo.getVariableForMonth(user.id, "2026-06")).toEqual([]);
    });

    it("deleteVariableForUser won't delete another user's row (IDOR guard)", async () => {
        const owner = await seedUser("owner@example.com");
        const attacker = await seedUser("attacker@example.com");
        const { id } = await repo.insertVariable(owner.id, {
            date: new Date("2026-06-10T06:00:00Z"),
            source: "owned",
            amount: 100,
        });

        expect(await repo.deleteVariableForUser(id, attacker.id)).toBe(0);
        expect(
            await repo.getVariableForMonth(owner.id, "2026-06"),
        ).toHaveLength(1);
    });

    it("deleteVariableForUser never removes the FIXED row", async () => {
        const user = await seedUser();
        await repo.setFixed(user.id, 44000);
        const fixed = await db.income.findFirstOrThrow({
            where: { userId: user.id, type: "FIXED" },
        });

        // Targeting the FIXED row's id through the variable-delete path is a no-op.
        expect(await repo.deleteVariableForUser(fixed.id, user.id)).toBe(0);
        expect(
            await db.income.count({
                where: { userId: user.id, type: "FIXED" },
            }),
        ).toBe(1);
    });
});
