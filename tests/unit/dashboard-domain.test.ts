// @vitest-environment node
import { describe, it, expect } from "vitest";

import {
    bucketOf,
    computeBuckets,
    savingsSpend,
    topCategories,
    type CategorySpend,
} from "@/lib/domain/dashboard";

/** Fixture builder — name/color are irrelevant to bucket math, filled for the type. */
function spend(
    over: Partial<CategorySpend> & { spent: number },
): CategorySpend {
    return {
        slug: over.slug ?? "housing",
        name: over.name ?? "Housing",
        color: over.color ?? "#000000",
        isRelevant: over.isRelevant ?? true,
        spent: over.spent,
    };
}

describe("bucketOf", () => {
    it("puts savings in its own bucket even though it's relevant", () => {
        expect(bucketOf({ slug: "savings", isRelevant: true })).toBe("savings");
    });

    it("excludes the unassigned sentinel from every bucket", () => {
        expect(bucketOf({ slug: "unassigned", isRelevant: false })).toBeNull();
    });

    it("classifies relevant → essentials, non-relevant → discretionary", () => {
        expect(bucketOf({ slug: "housing", isRelevant: true })).toBe(
            "essentials",
        );
        expect(bucketOf({ slug: "disposable-income", isRelevant: false })).toBe(
            "discretionary",
        );
    });
});

describe("computeBuckets", () => {
    const spends: CategorySpend[] = [
        spend({ slug: "housing", isRelevant: true, spent: 14000 }), // essentials
        spend({ slug: "groceries", isRelevant: true, spent: 3200 }), // essentials
        spend({ slug: "savings", isRelevant: true, spent: 12000 }), // savings
        spend({ slug: "disposable-income", isRelevant: false, spent: 1400 }), // discretionary
        spend({ slug: "unassigned", isRelevant: false, spent: 500 }), // excluded
    ];

    it("sums into essentials/discretionary/savings, excluding unassigned", () => {
        const buckets = computeBuckets(spends, 48000);
        const byKey = Object.fromEntries(buckets.map((b) => [b.key, b]));
        expect(byKey.essentials!.spent).toBe(17200); // 14000 + 3200
        expect(byKey.discretionary!.spent).toBe(1400); // unassigned 500 NOT counted
        expect(byKey.savings!.spent).toBe(12000);
    });

    it("derives 50/25/25 targets from income, in fixed order", () => {
        const buckets = computeBuckets([], 48000);
        expect(buckets.map((b) => b.key)).toEqual([
            "essentials",
            "discretionary",
            "savings",
        ]);
        expect(buckets.map((b) => b.target)).toEqual([24000, 12000, 12000]);
    });

    it("returns zero spend (and zero targets) with no income or expenses", () => {
        const buckets = computeBuckets([], 0);
        expect(buckets.every((b) => b.spent === 0 && b.target === 0)).toBe(
            true,
        );
    });
});

describe("topCategories", () => {
    const spends: CategorySpend[] = [
        spend({ slug: "housing", name: "Housing", spent: 14000 }),
        spend({ slug: "groceries", name: "Groceries", spent: 3200 }),
        spend({ slug: "transport", name: "Transport", spent: 2100 }),
        spend({ slug: "disposable-income", name: "Fun", spent: 1400 }),
        spend({ slug: "health", name: "Health", spent: 900 }),
        spend({ slug: "charity", name: "Charity", spent: 300 }),
        spend({ slug: "debt", name: "Debt", spent: 0 }), // zero-spend → dropped
        spend({ slug: "unassigned", name: "Unassigned", spent: 5000 }), // excluded
        spend({ slug: "savings", name: "Savings", spent: 9000 }), // allocation, excluded
    ];

    it("returns the highest-spend categories high→low, capped at the limit", () => {
        const top = topCategories(spends, 5);
        expect(top.map((c) => c.name)).toEqual([
            "Housing",
            "Groceries",
            "Transport",
            "Fun",
            "Health",
        ]);
    });

    it("drops zero-spend, unassigned, and savings (an allocation, not spend)", () => {
        const names = topCategories(spends, 20).map((c) => c.name);
        expect(names).not.toContain("Debt"); // zero spend
        expect(names).not.toContain("Unassigned"); // sentinel, despite $5000
        expect(names).not.toContain("Savings"); // allocation, despite $9000
    });

    it("returns an empty array when nothing has spend", () => {
        expect(topCategories([], 5)).toEqual([]);
    });
});

describe("savingsSpend", () => {
    it("sums only the savings category", () => {
        const spends: CategorySpend[] = [
            spend({ slug: "savings", spent: 5000 }),
            spend({ slug: "savings", spent: 1000 }),
            spend({ slug: "housing", spent: 8000 }),
        ];
        expect(savingsSpend(spends)).toBe(6000);
    });

    it("is 0 with no savings spend", () => {
        expect(savingsSpend([spend({ slug: "housing", spent: 8000 })])).toBe(0);
    });
});
