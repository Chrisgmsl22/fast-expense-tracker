import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";

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
        category: {
            id: "c1",
            slug: "groceries",
            name: "Groceries",
            color: "#65a30d",
        },
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
        category: {
            id: "c2",
            slug: "transport",
            name: "Transport",
            color: "#7c3aed",
        },
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

    it("splits the footer into Charged / My share / Saved / Total when savings is present", () => {
        const mixed: ExpenseListItem[] = [
            {
                id: "g1",
                date: new Date("2026-06-05T06:00:00Z"),
                description: "Groceries",
                amount: 1000,
                actualExpenditure: 680, // shared → my share < charged
                isShared: true,
                category: {
                    id: "cg",
                    slug: "groceries",
                    name: "Groceries",
                    color: "#65a30d",
                },
                subcategory: null,
                card: { name: "BBVA", color: "#2563eb" },
            },
            {
                id: "s1",
                date: new Date("2026-06-02T06:00:00Z"),
                description: "Emergency fund",
                amount: 5000,
                actualExpenditure: 5000,
                isShared: false,
                category: {
                    id: "cs",
                    slug: "savings",
                    name: "Savings",
                    color: "#0d9488",
                },
                subcategory: null,
                card: null,
            },
        ];
        render(<MonthFeed expenses={mixed} monthLabel="June 2026" />);
        // Charged = 1000 (consumption raw); My share = 680 (consumption share);
        // Saved = 5000; Total = 680 + 5000 = 5680 (money that left).
        const totals = within(screen.getByTestId("feed-totals"));
        expect(totals.getByText("Charged")).toBeDefined();
        expect(totals.getByText("$1,000.00")).toBeDefined();
        expect(totals.getByText("My share")).toBeDefined();
        expect(totals.getByText("$680.00")).toBeDefined();
        expect(totals.getByText("Set aside")).toBeDefined();
        expect(totals.getByText("$5,000.00")).toBeDefined();
        expect(totals.getByText("Total")).toBeDefined();
        expect(totals.getByText("$5,680.00")).toBeDefined();
    });

    it("omits Set aside / Total when there's no savings", () => {
        render(<MonthFeed expenses={expenses} monthLabel="June 2026" />);
        expect(screen.queryByText("Set aside")).toBeNull();
        expect(screen.queryByText("Total")).toBeNull();
    });

    it("shows no card (not Cash) for a savings row", () => {
        const savings: ExpenseListItem[] = [
            {
                id: "s1",
                date: new Date("2026-06-02T06:00:00Z"),
                description: "Emergency fund",
                amount: 5000,
                actualExpenditure: 5000,
                isShared: false,
                category: {
                    id: "cs",
                    slug: "savings",
                    name: "Savings",
                    color: "#0d9488",
                },
                subcategory: null,
                card: null,
            },
        ];
        render(<MonthFeed expenses={savings} monthLabel="June 2026" />);
        expect(screen.getByText("Emergency fund")).toBeDefined();
        // A savings transfer has no card — it must not render the "Cash" fallback.
        expect(screen.queryByText(/Cash/)).toBeNull();
    });
});
