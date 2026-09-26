// @vitest-environment node
import { describe, it, expect } from "vitest";

import { budgetRuleInputSchema } from "@/lib/schemas/budget-rule";

// Guards: the schema is new, so every case fails pre-fix (no module).
describe("budgetRuleInputSchema", () => {
    it.each([
        [{ essentials: 50, discretionary: 25, savings: 25 }],
        [{ essentials: 100, discretionary: 0, savings: 0 }],
        [{ essentials: "60", discretionary: "30", savings: "10" }],
    ])("Should accept a split that sums to 100: %j", (input) => {
        const res = budgetRuleInputSchema.safeParse(input);
        expect(res.success).toBe(true);
    });

    it("Should parse form strings into whole numbers", () => {
        const res = budgetRuleInputSchema.parse({
            essentials: "60",
            discretionary: "30",
            savings: "10",
        });
        expect(res).toEqual({ essentials: 60, discretionary: 30, savings: 10 });
    });

    it.each([
        ["99", { essentials: 50, discretionary: 25, savings: 24 }],
        ["101", { essentials: 50, discretionary: 25, savings: 26 }],
    ])("Should refuse a total of %s with a form-level issue", (_, input) => {
        const res = budgetRuleInputSchema.safeParse(input);
        expect(res.success).toBe(false);
        if (res.success) return;
        expect(res.error.issues).toEqual([
            expect.objectContaining({
                path: [],
                message: "The three buckets must add up to 100%",
            }),
        ]);
    });

    it.each([
        ["non-integer", { essentials: 50.5, discretionary: 24.5, savings: 25 }],
        ["negative", { essentials: 110, discretionary: -10, savings: 0 }],
        ["over 100", { essentials: 150, discretionary: -25, savings: -25 }],
        ["blank", { essentials: "", discretionary: 50, savings: 50 }],
        ["not a number", { essentials: "abc", discretionary: 50, savings: 50 }],
        ["missing", { discretionary: 50, savings: 50 }],
    ])("Should refuse a %s percentage on its field", (_, input) => {
        const res = budgetRuleInputSchema.safeParse(input);
        expect(res.success).toBe(false);
        if (res.success) return;
        expect(res.error.issues.some((i) => i.path.length === 1)).toBe(true);
    });

    it("Should refuse a single bucket over 100 even with a matching sum elsewhere", () => {
        const res = budgetRuleInputSchema.safeParse({
            essentials: 101,
            discretionary: 0,
            savings: -1,
        });
        expect(res.success).toBe(false);
        if (res.success) return;
        const paths = res.error.issues.map((i) => i.path[0]);
        expect(paths).toEqual(
            expect.arrayContaining(["essentials", "savings"]),
        );
    });
});
