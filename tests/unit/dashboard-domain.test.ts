// @vitest-environment node
import { describe, it, expect } from "vitest";

import { bucketOf, computeBuckets } from "@/lib/domain/dashboard";

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
    const spends = [
        { slug: "housing", isRelevant: true, spent: 14000 }, // essentials
        { slug: "groceries", isRelevant: true, spent: 3200 }, // essentials
        { slug: "savings", isRelevant: true, spent: 12000 }, // savings
        { slug: "disposable-income", isRelevant: false, spent: 1400 }, // discretionary
        { slug: "unassigned", isRelevant: false, spent: 500 }, // excluded
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
