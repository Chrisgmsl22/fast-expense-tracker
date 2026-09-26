// @vitest-environment node
import { describe, it, expect } from "vitest";

import { getDashboardSummary } from "@/lib/services/dashboard/dashboard.service";
import type {
    CardSpend,
    CategoryBudgetItem,
    DashboardRepository,
} from "@/lib/repositories/dashboard.repository";
import type { CategorySpend } from "@/lib/domain/dashboard";
import { FakeBudgetRuleRepository } from "@/tests/support/fake-budget-rule-repository";
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
    nonIncomeFundedTotal = 0,
): DashboardRepository {
    return {
        getCategorySpends: async () => spends,
        getCardSpends: async () => cards,
        getCategoryBreakdown: async () => categoryBudgets,
        getNonIncomeFundedTotal: async () => nonIncomeFundedTotal,
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
            budgetRuleRepo?: FakeBudgetRuleRepository;
        } = {},
    ) {
        const incomeRepo = new FakeIncomeRepository();
        incomeRepo.seedFixed("u1", 48000);
        return {
            incomeRepo,
            budgetRuleRepo:
                over.budgetRuleRepo ?? new FakeBudgetRuleRepository(),
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

    it("splits consumption vs savings; net still counts savings as outflow", async () => {
        const summary = await getDashboardSummary("u1", "2026-06", deps());
        // consumption = housing 14000 + Fun 1400 + unassigned 600 = 16000
        expect(summary.consumptionSpent).toBe(16000);
        expect(summary.savingsSpent).toBe(12000); // excluded from "spent"…
        // …but net still subtracts the full outflow (16000 + 12000).
        expect(summary.net).toBe(20000); // 48000 − 28000
    });

    it("computes daily average over CONSUMPTION and days left", async () => {
        const summary = await getDashboardSummary("u1", "2026-06", deps());
        // 15 days elapsed in June → consumption 16000 / 15 (savings excluded)
        expect(summary.daysLeft).toBe(15);
        expect(summary.dailyAvg).toBeCloseTo(16000 / 15, 5);
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

    it("passes cards through and derives top categories (excluding savings + unassigned)", async () => {
        const summary = await getDashboardSummary("u1", "2026-06", deps());
        expect(summary.cards).toEqual(cards);
        // Radar excludes savings (allocation, not spend) AND the unassigned sentinel.
        expect(summary.topCategories.map((c) => c.name)).toEqual([
            "Housing",
            "Fun",
        ]);
    });

    it("passes the category-budget breakdown through", async () => {
        const summary = await getDashboardSummary("u1", "2026-06", deps());
        expect(summary.categoryBudgets).toEqual(categoryBudgets);
    });

    // Guard: the default percents reach each bucket; its 50/25/25 targets already held.
    it("Should use 50/25/25 when the user has no saved rule", async () => {
        const summary = await getDashboardSummary("u1", "2026-06", deps());
        expect(summary.buckets.map((b) => [b.target, b.percent])).toEqual([
            [24000, 50],
            [12000, 25],
            [12000, 25],
        ]);
    });

    // Guard: fails pre-fix, where every month used the 50/25/25 constant.
    it("Should use the rule in force for the VIEWED month", async () => {
        const budgetRuleRepo = new FakeBudgetRuleRepository();
        budgetRuleRepo.seed("u1", "2026-05", {
            essentials: 60,
            discretionary: 30,
            savings: 10,
        });
        budgetRuleRepo.seed("u1", "2026-07", {
            essentials: 40,
            discretionary: 0,
            savings: 60,
        });

        const june = await getDashboardSummary(
            "u1",
            "2026-06",
            deps({ budgetRuleRepo }),
        );
        const july = await getDashboardSummary(
            "u1",
            "2026-07",
            deps({ budgetRuleRepo }),
        );
        const april = await getDashboardSummary(
            "u1",
            "2026-04",
            deps({ budgetRuleRepo }),
        );

        expect(june.buckets.map((b) => [b.target, b.percent])).toEqual([
            [28800, 60],
            [14400, 30],
            [4800, 10],
        ]);
        expect(july.buckets.map((b) => [b.target, b.percent])).toEqual([
            [19200, 40],
            [0, 0],
            [28800, 60],
        ]);
        expect(april.buckets.map((b) => b.percent)).toEqual([50, 25, 25]);
    });

    // Guard: another user's rule never reaches this user's buckets.
    it("Should ignore another user's rule", async () => {
        const budgetRuleRepo = new FakeBudgetRuleRepository();
        budgetRuleRepo.seed("someone-else", "2026-01", {
            essentials: 100,
            discretionary: 0,
            savings: 0,
        });
        const summary = await getDashboardSummary(
            "u1",
            "2026-06",
            deps({ budgetRuleRepo }),
        );
        expect(summary.buckets.map((b) => b.percent)).toEqual([50, 25, 25]);
    });
});
