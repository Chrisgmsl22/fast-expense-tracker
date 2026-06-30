import { describe, expect, it } from "vitest";

import {
    fixedIncomeInputSchema,
    variableIncomeInputSchema,
} from "@/lib/schemas/income";

describe("variableIncomeInputSchema", () => {
    it("accepts a valid row and coerces amount + date", () => {
        const res = variableIncomeInputSchema.safeParse({
            source: "Sold sneakers",
            amount: "1200",
            date: "2026-06-18",
        });
        expect(res.success).toBe(true);
        if (!res.success) return;
        expect(res.data.amount).toBe(1200);
        expect(res.data.date).toBeInstanceOf(Date);
    });

    it("requires a non-empty source", () => {
        const res = variableIncomeInputSchema.safeParse({
            source: "",
            amount: 100,
            date: "2026-06-18",
        });
        expect(res.success).toBe(false);
    });

    it("rejects a non-positive amount", () => {
        const res = variableIncomeInputSchema.safeParse({
            source: "x",
            amount: 0,
            date: "2026-06-18",
        });
        expect(res.success).toBe(false);
    });
});

describe("fixedIncomeInputSchema", () => {
    it("accepts 0 (clears the fixed amount)", () => {
        const res = fixedIncomeInputSchema.safeParse({ amount: "0" });
        expect(res.success).toBe(true);
        if (!res.success) return;
        expect(res.data.amount).toBe(0);
    });

    it("rejects a negative amount", () => {
        const res = fixedIncomeInputSchema.safeParse({ amount: -100 });
        expect(res.success).toBe(false);
    });
});
