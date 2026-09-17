// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
    expenseFundingSchema,
    expenseInputSchema,
} from "@/lib/schemas/expense";

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

    it("rejects any paidBy other than 'you' (gf is deprecated — ADR-0020)", () => {
        expect(
            expenseInputSchema.safeParse({ ...valid, paidBy: "someone" })
                .success,
        ).toBe(false);
        expect(
            expenseInputSchema.safeParse({ ...valid, paidBy: "gf" }).success,
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
        });
        expect(r.success).toBe(true);
    });
    describe("fundedFrom (spec 0007 §3.1)", () => {
        it("defaults to income when the form doesn't send it", () => {
            const r = expenseInputSchema.safeParse(valid);
            expect(r.success).toBe(true);
            if (!r.success) return;
            expect(r.data.fundedFrom).toBe("income");
        });

        it("accepts the three known values", () => {
            for (const fundedFrom of ["income", "savings", "reimbursed"]) {
                expect(
                    expenseInputSchema.safeParse({ ...valid, fundedFrom })
                        .success,
                ).toBe(true);
            }
        });

        it("rejects an unknown value", () => {
            expect(
                expenseInputSchema.safeParse({ ...valid, fundedFrom: "gift" })
                    .success,
            ).toBe(false);
        });
    });

    describe("expenseFundingSchema — reimbursed is health-only (§3.3)", () => {
        it("allows reimbursed on health", () => {
            const r = expenseFundingSchema.safeParse({
                fundedFrom: "reimbursed",
                categorySlug: "health",
            });
            expect(r.success).toBe(true);
        });

        it("rejects reimbursed on any other category", () => {
            const r = expenseFundingSchema.safeParse({
                fundedFrom: "reimbursed",
                categorySlug: "shopping",
            });
            expect(r.success).toBe(false);
            if (r.success) return;
            // The error must land on the funding field, so the form shows it
            // next to the control the user has to change.
            expect(r.error.issues[0]?.path).toEqual(["fundedFrom"]);
            expect(r.error.issues[0]?.message).toContain("health");
        });

        it("fails closed when the category didn't resolve", () => {
            expect(
                expenseFundingSchema.safeParse({
                    fundedFrom: "reimbursed",
                    categorySlug: null,
                }).success,
            ).toBe(false);
        });

        it("leaves income and savings unrestricted by category", () => {
            for (const fundedFrom of ["income", "savings"]) {
                expect(
                    expenseFundingSchema.safeParse({
                        fundedFrom,
                        categorySlug: "shopping",
                    }).success,
                ).toBe(true);
            }
        });
    });
});
