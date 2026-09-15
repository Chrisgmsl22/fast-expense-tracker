import { describe, it, expect } from "vitest";

import { db } from "@/lib/db";
import { computeBuckets } from "@/lib/domain/dashboard";
import { partnerShareTotal } from "@/lib/domain/movement";
import { PrismaDashboardRepository } from "@/lib/repositories/dashboard.repository";
import { PrismaSettlementRepository } from "@/lib/repositories/settlement.repository";

/**
 * The two-ledger property, in the user's own words:
 *
 * > "theres a chance I paid for it with my savings money and its a shared
 * > expense, so I would also check it and in the end I would have this not
 * > count for me BUT it would be counted for Brenda to pay me."
 *
 * Budget and Settlement are different ledgers and must never be crossed
 * (ADR-0020). A savings-funded shared expense leaves HIS buckets entirely,
 * because this month's income didn't fund it — while HER share is still owed,
 * because she genuinely owes it whatever money he used to front it.
 *
 * Asserted against both real queries, not a fake: the budget reads filter on
 * `fundedFrom`, and `getForWindow` deliberately does not.
 */

const dashboardRepo = new PrismaDashboardRepository(db);
const settlementRepo = new PrismaSettlementRepository(db);

const WINDOW_START = new Date("2026-06-01T06:00:00Z");
const WINDOW_END = new Date("2026-07-01T06:00:00Z");
const MONTH = "2026-06";

/** $1,000 shared at his 68 / her 32, paid from savings he already had. */
const AMOUNT = 1000;
const HIS_SHARE = 680;
const HER_SHARE = AMOUNT - HIS_SHARE;

async function seedSharedSavingsExpense() {
    const user = await db.user.create({
        data: { email: "u@example.com", password: "x", name: "Test" },
    });
    const category = await db.category.create({
        data: {
            userId: user.id,
            slug: "groceries",
            name: "Groceries",
            isRelevant: true,
        },
    });
    await db.expense.create({
        data: {
            userId: user.id,
            categoryId: category.id,
            date: new Date("2026-06-10T12:00:00Z"),
            description: "Groceries paid from savings",
            amount: AMOUNT,
            actualExpenditure: HIS_SHARE,
            isShared: true,
            yourPercentage: 0.68,
            fundedFrom: "savings",
        },
    });
    return user;
}

describe("a savings-funded SHARED expense (two ledgers, spec 0007 §2 + ADR-0020)", () => {
    it("contributes nothing to the three buckets", async () => {
        const user = await seedSharedSavingsExpense();

        const spends = await dashboardRepo.getCategorySpends(user.id, MONTH);
        const buckets = computeBuckets(spends, 0);

        // Not a smaller number — not a row at all. The filter is in the query.
        expect(spends).toEqual([]);
        expect(buckets.every((b) => b.spent === 0)).toBe(true);
        expect(buckets.reduce((sum, b) => sum + b.spent, 0)).toBe(0);
    });

    it("contributes nothing to the category grid either", async () => {
        const user = await seedSharedSavingsExpense();

        expect(
            await dashboardRepo.getCategoryBreakdown(user.id, MONTH),
        ).toEqual([]);
    });

    it("still owes him her full share in the settlement", async () => {
        const user = await seedSharedSavingsExpense();

        const rows = await settlementRepo.getForWindow(
            user.id,
            WINDOW_START,
            WINDOW_END,
        );

        // The settlement read is funding-blind on purpose: she owes her share
        // whatever money he used to front it.
        expect(rows.expenses).toHaveLength(1);
        expect(rows.expenses[0]?.isShared).toBe(true);
        expect(rows.expenses[0]?.amount).toBe(AMOUNT);
        expect(partnerShareTotal(rows.expenses)).toBe(HER_SHARE);
        expect(partnerShareTotal(rows.expenses)).toBe(320);
    });

    it("keeps the two answers independent — zero to him, her full share to her", async () => {
        // The property stated in one assertion, so crossing the ledgers in
        // either direction fails here.
        const user = await seedSharedSavingsExpense();

        const [spends, rows] = await Promise.all([
            dashboardRepo.getCategorySpends(user.id, MONTH),
            settlementRepo.getForWindow(user.id, WINDOW_START, WINDOW_END),
        ]);

        const hisBudgetSpend = spends.reduce((sum, c) => sum + c.spent, 0);
        expect(hisBudgetSpend).toBe(0);
        expect(partnerShareTotal(rows.expenses)).toBe(HER_SHARE);

        // And the money is still visible to him, just outside the budget.
        expect(
            await dashboardRepo.getNonIncomeFundedTotal(user.id, MONTH),
        ).toBe(HIS_SHARE);
    });

    it("counts normally for both once the same expense is income-funded", async () => {
        // The control case: only `fundedFrom` differs, and only his side moves.
        const user = await seedSharedSavingsExpense();
        await db.expense.updateMany({
            where: { userId: user.id },
            data: { fundedFrom: "income" },
        });

        const [spends, rows] = await Promise.all([
            dashboardRepo.getCategorySpends(user.id, MONTH),
            settlementRepo.getForWindow(user.id, WINDOW_START, WINDOW_END),
        ]);

        expect(spends.reduce((sum, c) => sum + c.spent, 0)).toBe(HIS_SHARE);
        expect(partnerShareTotal(rows.expenses)).toBe(HER_SHARE);
    });
});
