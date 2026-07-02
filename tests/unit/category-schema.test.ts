import { describe, it, expect } from "vitest";

import { categoryBudgetInputSchema } from "@/lib/schemas/category";

function parse(over: Partial<Record<string, unknown>> = {}) {
    return categoryBudgetInputSchema.safeParse({
        slug: "health",
        month: "2026-06",
        thisMonthAmount: "1800",
        defaultAmount: "1500",
        ...over,
    });
}

describe("categoryBudgetInputSchema", () => {
    it("accepts positive amounts and normalizes to numbers", () => {
        const res = parse();
        expect(res.success).toBe(true);
        if (res.success) {
            expect(res.data.thisMonthAmount).toBe(1800);
            expect(res.data.defaultAmount).toBe(1500);
        }
    });

    it("strips thousands separators / spaces (1,800 → 1800)", () => {
        const res = parse({ thisMonthAmount: "1,800", defaultAmount: "2 500" });
        expect(res.success).toBe(true);
        if (res.success) {
            expect(res.data.thisMonthAmount).toBe(1800);
            expect(res.data.defaultAmount).toBe(2500);
        }
    });

    it("treats blank / whitespace-only as null (no limit)", () => {
        const res = parse({ thisMonthAmount: "", defaultAmount: "   " });
        expect(res.success).toBe(true);
        if (res.success) {
            expect(res.data.thisMonthAmount).toBeNull();
            expect(res.data.defaultAmount).toBeNull();
        }
    });

    it("rejects zero and negative amounts", () => {
        expect(parse({ thisMonthAmount: "0" }).success).toBe(false);
        expect(parse({ thisMonthAmount: "-5" }).success).toBe(false);
    });

    it("rejects a malformed month", () => {
        expect(parse({ month: "2026-13" }).success).toBe(false);
        expect(parse({ month: "June" }).success).toBe(false);
    });

    it("requires a slug", () => {
        expect(parse({ slug: "" }).success).toBe(false);
    });
});
