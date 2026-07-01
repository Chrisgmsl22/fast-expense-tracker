import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { MonthFeed } from "@/components/dashboard/MonthFeed";
import type { ExpenseListItem } from "@/lib/repositories/expense.repository";

const expenses: ExpenseListItem[] = [
    {
        id: "e1",
        date: new Date("2026-06-18T06:00:00Z"),
        description: "Soriana",
        amount: 1820,
        actualExpenditure: 1237,
        isShared: true,
        category: { id: "c1", name: "Groceries", color: "#65a30d" },
        subcategory: null,
        card: { name: "BBVA", color: "#2563eb" },
    },
    {
        id: "e2",
        date: new Date("2026-06-20T06:00:00Z"),
        description: "Uber",
        amount: 185,
        actualExpenditure: 185,
        isShared: false,
        category: { id: "c2", name: "Transport", color: "#7c3aed" },
        subcategory: null,
        card: null,
    },
];

describe("MonthFeed", () => {
    it("lists the month's expenses with share subtext and card fallback", () => {
        render(<MonthFeed expenses={expenses} monthLabel="June 2026" />);
        expect(screen.getByText("Soriana")).toBeDefined();
        expect(screen.getByText("share $1,237.00")).toBeDefined();
        // Null card falls back to Cash; non-shared shows "solo".
        expect(screen.getByText(/Cash/)).toBeDefined();
        expect(screen.getByText("solo")).toBeDefined();
    });

    it("totals Charged + My share in the footer", () => {
        render(<MonthFeed expenses={expenses} monthLabel="June 2026" />);
        // charged = 1820 + 185 = 2005; my share = 1237 + 185 = 1422
        expect(screen.getByText("$2,005.00")).toBeDefined();
        expect(screen.getByText("$1,422.00")).toBeDefined();
    });

    it("shows an empty state and no footer with no expenses", () => {
        render(<MonthFeed expenses={[]} monthLabel="June 2026" />);
        expect(screen.getByText(/no expenses this month yet/i)).toBeDefined();
        expect(screen.queryByText("Charged")).toBeNull();
    });
});
