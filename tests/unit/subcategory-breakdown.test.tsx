import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { SubcategoryBreakdown } from "@/components/category/SubcategoryBreakdown";
import type { SubcategoryBar } from "@/lib/domain/category";

const bars: SubcategoryBar[] = [
    { id: "s1", name: "Doctors appt", spent: 1400, pct: 36 },
    { id: "s2", name: "Dentist", spent: 1100, pct: 28 },
    { id: "s4", name: "Additional medication", spent: 0, pct: 0 },
    { id: null, name: "Other", spent: 0, pct: 0 },
];

/** Normalized text of the <li> that contains a given label. */
function rowText(label: string): string {
    return screen
        .getByText(label)
        .closest("li")!
        .textContent!.replace(/\s+/g, " ")
        .trim();
}

describe("SubcategoryBreakdown", () => {
    it("renders a bar per spent subcategory with amount and percent of category", () => {
        render(<SubcategoryBreakdown bars={bars} color="#0d9488" />);
        expect(screen.getByText("Spend by subcategory")).toBeDefined();
        expect(rowText("Doctors appt")).toContain("$1,400.00");
        expect(rowText("Doctors appt")).toContain("36%");
        expect(rowText("Dentist")).toContain("$1,100.00");
    });

    it("collapses zero-spend subcategories into a faint footer, not bars", () => {
        render(<SubcategoryBreakdown bars={bars} color="#0d9488" />);
        // Zero rows are not list items (no bar) — they render as "— $0" footer text.
        const faint = screen.getByText(/Additional medication — \$0/);
        expect(faint.closest("li")).toBeNull();
        expect(screen.getAllByText(/— \$0/).length).toBe(2); // Additional medication + Other
    });

    it("renders the null-id 'Other' rollup as a bar when it has spend", () => {
        render(
            <SubcategoryBreakdown
                bars={[
                    { id: "s1", name: "Dentist", spent: 100, pct: 25 },
                    { id: null, name: "Other", spent: 300, pct: 75 },
                ]}
                color="#0d9488"
            />,
        );
        expect(rowText("Other")).toContain("$300.00");
        expect(rowText("Other")).toContain("75%");
    });

    it("shows an empty state when nothing was spent", () => {
        render(
            <SubcategoryBreakdown
                bars={[{ id: "s1", name: "Doctors appt", spent: 0, pct: 0 }]}
                color="#0d9488"
            />,
        );
        expect(
            screen.getByText(/no spend in this category this month/i),
        ).toBeDefined();
    });
});
