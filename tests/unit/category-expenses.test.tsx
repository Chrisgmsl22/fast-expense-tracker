import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { CategoryExpenses } from "@/components/category/CategoryExpenses";
import type { CategoryExpenseListItem } from "@/lib/repositories/category.repository";

/**
 * A row as the repository returns it. `countedInBudget` defaults to the verdict
 * the SQL filter would give a row with this `fundedFrom`; a test sets it
 * explicitly only to build the case where the two disagree.
 */
function exp(
    over: Partial<CategoryExpenseListItem> & { id: string },
): CategoryExpenseListItem {
    // Honour the override: hardcoding this dropped the field silently and no
    // test could reach a non-income row (that's how the missing badge shipped).
    const fundedFrom = over.fundedFrom ?? "income";
    return {
        id: over.id,
        date: over.date ?? new Date("2026-06-19T12:00:00Z"),
        description: over.description ?? "Dr. Salinas",
        amount: over.amount ?? 1400,
        actualExpenditure: over.actualExpenditure ?? 1400,
        fundedFrom,
        countedInBudget: over.countedInBudget ?? fundedFrom === "income",
        isShared: over.isShared ?? false,
        category: over.category ?? {
            id: "cat1",
            slug: "health",
            name: "Health",
            color: "#0d9488",
        },
        // `in` checks (not `??`) so an explicit null overrides the default.
        subcategory:
            "subcategory" in over
                ? over.subcategory!
                : { id: "sub1", name: "Doctors appt" },
        card: "card" in over ? over.card! : { name: "BBVA", color: "#2563eb" },
    };
}

describe("CategoryExpenses", () => {
    it("renders each row with description, subcategory, card, and amount", () => {
        render(
            <CategoryExpenses expenses={[exp({ id: "e1" })]} color="#0d9488" />,
        );
        expect(screen.getByText("Dr. Salinas")).toBeDefined();
        expect(screen.getByText("Doctors appt")).toBeDefined();
        expect(screen.getByText(/BBVA/)).toBeDefined();
        expect(screen.getByText("$1,400.00")).toBeDefined();
    });

    it("shows a my-share subtext only on shared rows", () => {
        render(
            <CategoryExpenses
                expenses={[
                    exp({
                        id: "e1",
                        isShared: true,
                        amount: 1000,
                        actualExpenditure: 680,
                        fundedFrom: "income" as const,
                    }),
                ]}
                color="#0d9488"
            />,
        );
        expect(screen.getByText(/my share \$680\.00/)).toBeDefined();
    });

    it("omits the my-share subtext on a solo expense", () => {
        render(
            <CategoryExpenses
                expenses={[exp({ id: "e1", isShared: false })]}
                color="#0d9488"
            />,
        );
        expect(screen.queryByText(/my share/)).toBeNull();
    });

    it("omits the subcategory label and card meta when an expense has neither", () => {
        render(
            <CategoryExpenses
                expenses={[
                    exp({
                        id: "e1",
                        description: "Uncategorized",
                        subcategory: null,
                        card: null, // cash — no " · <card>" suffix
                    }),
                ]}
                color="#0d9488"
            />,
        );
        expect(screen.getByText("Uncategorized")).toBeDefined();
        expect(screen.queryByText("Doctors appt")).toBeNull();
        expect(screen.queryByText(/BBVA/)).toBeNull();
    });

    it("badges a savings-funded row, which the header's Spent leaves out", () => {
        // The gap this closes: the row is on screen at $3,000 while `spent`
        // above counts it as nothing (spec 0007 §2). Without the badge the
        // screen contradicts itself and says nothing about why.
        render(
            <CategoryExpenses
                expenses={[
                    exp({
                        id: "e1",
                        description: "Shoes",
                        amount: 3000,
                        actualExpenditure: 3000,
                        fundedFrom: "savings",
                    }),
                ]}
                color="#0d9488"
            />,
        );
        expect(screen.getByText("Shoes")).toBeDefined();
        expect(screen.getByText("from savings")).toBeDefined();
    });

    it("badges a reimbursed row too", () => {
        render(
            <CategoryExpenses
                expenses={[exp({ id: "e1", fundedFrom: "reimbursed" })]}
                color="#0d9488"
            />,
        );
        expect(screen.getByText("reimbursed")).toBeDefined();
    });

    it("leaves an income-funded row unbadged", () => {
        render(
            <CategoryExpenses expenses={[exp({ id: "e1" })]} color="#0d9488" />,
        );
        expect(screen.queryByText(/from savings|reimbursed/)).toBeNull();
        expect(screen.queryByText(/not from income/i)).toBeNull();
    });

    it("badges a row the budget dropped even when it narrows to income", () => {
        // The stored column held something out-of-band (say "cash-back"): the
        // SQL filter dropped it, so it sits in the header's "Not from this
        // month's income" figure — but `toFundingSource` read it back as
        // `income`. Badging on `fundedFrom` left this exact row bare, so the
        // header pointed at a list showing nothing.
        render(
            <CategoryExpenses
                expenses={[
                    exp({
                        id: "e1",
                        description: "Airline credit",
                        amount: 900,
                        actualExpenditure: 900,
                        fundedFrom: "income",
                        countedInBudget: false,
                    }),
                ]}
                color="#0d9488"
            />,
        );
        expect(screen.getByText("Airline credit")).toBeDefined();
        expect(screen.getByText("not from income")).toBeDefined();
        // It must not borrow a source it cannot prove.
        expect(screen.queryByText(/from savings|reimbursed/)).toBeNull();
    });

    it("shows an empty state when the category has no expenses", () => {
        render(<CategoryExpenses expenses={[]} color="#0d9488" />);
        expect(
            screen.getByText(/no expenses in this category this month/i),
        ).toBeDefined();
    });
});
