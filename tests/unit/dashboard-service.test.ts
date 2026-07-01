// @vitest-environment node
import { describe, it, expect } from "vitest";

import { getDashboardSummary } from "@/lib/services/dashboard/dashboard.service";
import type { DashboardRepository } from "@/lib/repositories/dashboard.repository";
import type { CategorySpend } from "@/lib/domain/dashboard";
import { FakeIncomeRepository } from "@/tests/support/fake-income-repository";

function fakeDashboardRepo(spends: CategorySpend[]): DashboardRepository {
    return { getCategorySpends: async () => spends };
}

describe("getDashboardSummary", () => {
    const spends: CategorySpend[] = [
        { slug: "housing", isRelevant: true, spent: 14000 },
        { slug: "savings", isRelevant: true, spent: 12000 },
        { slug: "disposable-income", isRelevant: false, spent: 1400 },
        { slug: "unassigned", isRelevant: false, spent: 600 },
    ];

    function deps(over: { spends?: CategorySpend[]; now?: Date } = {}) {
        const incomeRepo = new FakeIncomeRepository();
        incomeRepo.seedFixed("u1", 48000);
        return {
            incomeRepo,
            dashboardRepo: fakeDashboardRepo(over.spends ?? spends),
            now: over.now ?? new Date("2026-06-15T12:00:00Z"),
        };
    }

    it("assembles income, buckets, and the stat strip", async () => {
        const summary = await getDashboardSummary("u1", "2026-06", deps());

        expect(summary.income.total).toBe(48000);
        const byKey = Object.fromEntries(
            summary.buckets.map((b) => [b.key, b]),
        );
        expect(byKey.essentials!.spent).toBe(14000);
        expect(byKey.savings!.spent).toBe(12000);
        expect(byKey.discretionary!.spent).toBe(1400);
    });

    it("counts ALL category spend in spentTotal/net (including unassigned)", async () => {
        const summary = await getDashboardSummary("u1", "2026-06", deps());
        // 14000 + 12000 + 1400 + 600 = 28000
        expect(summary.spentTotal).toBe(28000);
        expect(summary.net).toBe(20000); // 48000 − 28000
    });

    it("computes daily average over elapsed days and days left", async () => {
        const summary = await getDashboardSummary("u1", "2026-06", deps());
        // 15 days elapsed in June → 28000 / 15
        expect(summary.daysLeft).toBe(15);
        expect(summary.dailyAvg).toBeCloseTo(28000 / 15, 5);
    });

    it("avoids divide-by-zero for a future month (0 elapsed)", async () => {
        const summary = await getDashboardSummary(
            "u1",
            "2026-08",
            deps({ now: new Date("2026-06-15T12:00:00Z") }),
        );
        expect(summary.dailyAvg).toBe(0);
        expect(summary.daysLeft).toBe(31);
    });

    it("yields a negative net when spend exceeds income", async () => {
        const summary = await getDashboardSummary(
            "u1",
            "2026-06",
            deps({
                spends: [{ slug: "housing", isRelevant: true, spent: 60000 }],
            }),
        );
        expect(summary.net).toBe(-12000); // 48000 − 60000
    });
});
