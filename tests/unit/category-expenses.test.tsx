import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { CategoryExpenses } from "@/components/category/CategoryExpenses";
import type { ExpenseListItem } from "@/lib/repositories/expense.repository";

function exp(over: Partial<ExpenseListItem> & { id: string }): ExpenseListItem {
    return {
        id: over.id,
        date: over.date ?? new Date("2026-06-19T12:00:00Z"),
        description: over.description ?? "Dr. Salinas",
        amount: over.amount ?? 1400,
        actualExpenditure: over.actualExpenditure ?? 1400,
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
                : { name: "Doctors appt" },
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

    it("shows an empty state when the category has no expenses", () => {
        render(<CategoryExpenses expenses={[]} color="#0d9488" />);
        expect(
            screen.getByText(/no expenses in this category this month/i),
        ).toBeDefined();
    });
});
