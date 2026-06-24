import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { ExpenseList } from "@/components/expense/ExpenseList";
import type { ExpenseListItem } from "@/lib/services/expense/expense.service";

const sharedRow: ExpenseListItem = {
    id: "e1",
    date: new Date("2026-05-15T06:00:00.000Z"),
    description: "Weekly groceries",
    amount: 1000,
    actualExpenditure: 680,
    isShared: true,
    category: { name: "Groceries" },
    subcategory: { name: "Supermarket" },
    card: { name: "BBVA" },
};

describe("ExpenseList", () => {
    it("renders an empty state when there are no expenses", () => {
        render(<ExpenseList expenses={[]} />);
        expect(screen.getByText(/no expenses for this month/i)).toBeDefined();
    });

    it("renders a shared expense with its description, card, and your-share line", () => {
        render(<ExpenseList expenses={[sharedRow]} />);
        expect(screen.getByText("Weekly groceries")).toBeDefined();
        expect(screen.getByText("BBVA")).toBeDefined();
        expect(screen.getByText(/your share/i)).toBeDefined();
    });

    it("shows Cash and no your-share line for an unshared cash expense", () => {
        render(
            <ExpenseList
                expenses={[{ ...sharedRow, card: null, isShared: false }]}
            />,
        );
        expect(screen.getByText("Cash")).toBeDefined();
        expect(screen.queryByText(/your share/i)).toBeNull();
    });
});
