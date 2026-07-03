import { describe, it, expect } from "vitest";

import {
    budgetForMonth,
    subcategoryBreakdown,
    type SubcategorySpendRow,
} from "@/lib/domain/category";

const rows: SubcategorySpendRow[] = [
    { id: "s1", name: "Doctors appt", spent: 1400 },
    { id: "s2", name: "Dentist", spent: 1100 },
    { id: "s3", name: "Therapy", spent: 800 },
    { id: "s4", name: "Additional medication", spent: 0 },
];

describe("subcategoryBreakdown", () => {
    it("sorts high→low and computes each row's percent of the category", () => {
        const bars = subcategoryBreakdown(rows, 3300);
        expect(bars.map((b) => b.name)).toEqual([
            "Doctors appt",
            "Dentist",
            "Therapy",
            "Additional medication",
        ]);
        // 1400 / 3300 ≈ 42.42%
        expect(bars[0]!.pct).toBeCloseTo((1400 / 3300) * 100, 5);
    });

    it("keeps zero-spend rows at 0% and sinks them to the end", () => {
        const bars = subcategoryBreakdown(rows, 3300);
        const last = bars[bars.length - 1]!;
        expect(last.name).toBe("Additional medication");
        expect(last.spent).toBe(0);
        expect(last.pct).toBe(0);
    });

    it("yields all-0% bars (no divide-by-zero) when the category has no spend", () => {
        const bars = subcategoryBreakdown(
            [
                { id: "s1", name: "A", spent: 0 },
                { id: "s2", name: "B", spent: 0 },
            ],
            0,
        );
        expect(bars.every((b) => b.pct === 0)).toBe(true);
    });

    it("treats the null-id 'Other' rollup like any other row", () => {
        const bars = subcategoryBreakdown(
            [
                { id: "s1", name: "Dentist", spent: 100 },
                { id: null, name: "Other", spent: 300 },
            ],
            400,
        );
        expect(bars[0]).toEqual({
            id: null,
            name: "Other",
            spent: 300,
            pct: 75,
        });
    });
});

describe("budgetForMonth", () => {
    it("uses the month override when one is set", () => {
        expect(budgetForMonth(4000, 3000)).toBe(3000);
    });

    it("falls back to the default when there's no override", () => {
        expect(budgetForMonth(4000, null)).toBe(4000);
    });

    it("is 'no limit' (null) when neither override nor default is set", () => {
        expect(budgetForMonth(null, null)).toBeNull();
    });

    it("lets a 0 override win over the default (explicit, not falsy-coerced)", () => {
        expect(budgetForMonth(4000, 0)).toBe(0);
    });
});
