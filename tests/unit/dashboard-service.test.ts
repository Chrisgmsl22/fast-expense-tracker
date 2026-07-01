// @vitest-environment node
import { describe, it, expect } from "vitest";

import { getDashboardSummary } from "@/lib/services/dashboard/dashboard.service";
import type {
    CardSpend,
    CategoryBudgetItem,
    DashboardRepository,
} from "@/lib/repositories/dashboard.repository";
import type { CategorySpend } from "@/lib/domain/dashboard";
import { FakeIncomeRepository } from "@/tests/support/fake-income-repository";

function cat(over: Partial<CategorySpend> & { spent: number }): CategorySpend {
    return {
        slug: over.slug ?? "housing",
        name: over.name ?? "Housing",
        color: over.color ?? "#000000",
        isRelevant: over.isRelevant ?? true,
        spent: over.spent,
    };
}

function fakeDashboardRepo(
    spends: CategorySpend[],
    cards: CardSpend[] = [],
    categoryBudgets: CategoryBudgetItem[] = [],
): DashboardRepository {
    return {
        getCategorySpends: async () => spends,
        getCardSpends: async () => cards,
        getCategoryBreakdown: async () => categoryBudgets,
    };
}

describe("getDashboardSummary", () => {
    const spends: CategorySpend[] = [
        cat({
            slug: "housing",
            name: "Housing",
            isRelevant: true,
            spent: 14000,
        }),
        cat({
            slug: "savings",
            name: "Savings",
            isRelevant: true,
            spent: 12000,
        }),
        cat({
            slug: "disposable-income",
            name: "Fun",
            isRelevant: false,
            spent: 1400,
        }),
        cat({
            slug: "unassigned",
            name: "Unassigned",
            isRelevant: false,
            spent: 600,
        }),
    ];
    const cards: CardSpend[] = [
        { id: "c1", name: "Platinum", color: "#6b7280", spent: 18000 },
        { id: "cash", name: "Cash", color: "#16a34a", spent: 10000 },
    ];
    const categoryBudgets: CategoryBudgetItem[] = [
        {
            slug: "housing",
            name: "Housing",
            color: "#4f46e5",
            monthlyBudget: 14000,
            spent: 14000,
            subcatTotal: 5,
            subcatWithSpend: 1,
        },
    ];

    function deps(
        over: {
            spends?: CategorySpend[];
            cards?: CardSpend[];
            categoryBudgets?: CategoryBudgetItem[];
            now?: Date;
        } = {},
    ) {
        const incomeRepo = new FakeIncomeRepository();
        incomeRepo.seedFixed("u1", 48000);
        return {
            incomeRepo,
            dashboardRepo: fakeDashboardRepo(
                over.spends ?? spends,
                over.cards ?? cards,
                over.categoryBudgets ?? categoryBudgets,
            ),
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
                spends: [
                    cat({ slug: "housing", isRelevant: true, spent: 60000 }),
                ],
            }),
        );
        expect(summary.net).toBe(-12000); // 48000 − 60000
    });

    it("passes cards through and derives top categories (excluding unassigned)", async () => {
        const summary = await getDashboardSummary("u1", "2026-06", deps());
        expect(summary.cards).toEqual(cards);
        // Housing/Savings/Fun ranked by spend; unassigned excluded from the radar.
        expect(summary.topCategories.map((c) => c.name)).toEqual([
            "Housing",
            "Savings",
            "Fun",
        ]);
    });

    it("passes the category-budget breakdown through", async () => {
        const summary = await getDashboardSummary("u1", "2026-06", deps());
        expect(summary.categoryBudgets).toEqual(categoryBudgets);
    });
});
