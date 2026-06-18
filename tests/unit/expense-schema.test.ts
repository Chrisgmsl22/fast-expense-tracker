// @vitest-environment node
import { describe, it, expect } from "vitest";
import { expenseInputSchema } from "@/lib/schemas/expense";

const valid = {
    date: "2026-06-15",
    amount: "1000",
    categoryId: "cat-1",
    description: "Groceries",
    isShared: false,
};

describe("expenseInputSchema", () => {
    it("accepts a valid input and coerces amount + date", () => {
        const parsed = expenseInputSchema.parse(valid);
        expect(parsed.amount).toBe(1000);
        expect(parsed.date).toBeInstanceOf(Date);
    });

    it("applies defaults for paidBy, isShared, yourPercentage", () => {
        const parsed = expenseInputSchema.parse({
            date: "2026-06-15",
            amount: 50,
            categoryId: "cat-1",
            description: "Coffee",
        });
        expect(parsed.paidBy).toBe("you");
        expect(parsed.isShared).toBe(false);
        expect(parsed.yourPercentage).toBe(1);
    });

    it("rejects a non-positive amount", () => {
        expect(
            expenseInputSchema.safeParse({ ...valid, amount: "0" }).success,
        ).toBe(false);
        expect(
            expenseInputSchema.safeParse({ ...valid, amount: "-5" }).success,
        ).toBe(false);
    });

    it("rejects missing category and missing description", () => {
        expect(
            expenseInputSchema.safeParse({ ...valid, categoryId: "" }).success,
        ).toBe(false);
        expect(
            expenseInputSchema.safeParse({ ...valid, description: "" }).success,
        ).toBe(false);
    });

    it("rejects an invalid paidBy", () => {
        expect(
            expenseInputSchema.safeParse({ ...valid, paidBy: "someone" })
                .success,
        ).toBe(false);
    });

    it("rejects a shared expense whose share is still 100%", () => {
        const r = expenseInputSchema.safeParse({
            ...valid,
            isShared: true,
            yourPercentage: "1",
        });
        expect(r.success).toBe(false);
    });

    it("accepts a shared expense with a sub-100% share", () => {
        const r = expenseInputSchema.safeParse({
            ...valid,
            isShared: true,
            yourPercentage: "0.7",
            paidBy: "gf",
        });
        expect(r.success).toBe(true);
    });
});
