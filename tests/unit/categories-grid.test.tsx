import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { CategoriesGrid } from "@/components/dashboard/CategoriesGrid";
import type { CategoryBudgetItem } from "@/lib/repositories/dashboard.repository";

function cat(
    over: Partial<CategoryBudgetItem> & { name: string },
): CategoryBudgetItem {
    return {
        slug: over.slug ?? over.name.toLowerCase(),
        name: over.name,
        color: over.color ?? "#4f46e5",
        monthlyBudget: over.monthlyBudget ?? null,
        spent: over.spent ?? 0,
        subcatTotal: over.subcatTotal ?? 0,
        subcatWithSpend: over.subcatWithSpend ?? 0,
    };
}

describe("CategoriesGrid", () => {
    it("shows money left + subcat count for an under-budget category", () => {
        render(
            <CategoriesGrid
                categories={[
                    cat({
                        name: "Groceries",
                        monthlyBudget: 5000,
                        spent: 3200,
                        subcatTotal: 2,
                        subcatWithSpend: 2,
                    }),
                ]}
            />,
        );
        expect(screen.getByText("Groceries")).toBeDefined();
        expect(screen.getByText("$3,200.00")).toBeDefined();
        expect(
            screen.getByText(
                /limit \$5,000\.00 · \$1,800\.00 left · 2 of 2 subcats/,
            ),
        ).toBeDefined();
    });

    it("shows an over-by amount when spent exceeds the budget", () => {
        render(
            <CategoriesGrid
                categories={[
                    cat({
                        name: "Housing",
                        monthlyBudget: 14000,
                        spent: 15000,
                        subcatTotal: 5,
                        subcatWithSpend: 1,
                    }),
                ]}
            />,
        );
        // "over by $X" is a danger span; the subcat count is a sibling text node.
        expect(screen.getByText("over by $1,000.00")).toBeDefined();
        expect(screen.getByText(/1 of 5 subcats/)).toBeDefined();
    });

    it("reads 'no limit' when the category has no budget", () => {
        render(
            <CategoriesGrid
                categories={[
                    cat({ name: "Debt", monthlyBudget: null, spent: 900 }),
                ]}
            />,
        );
        expect(screen.getByText(/no limit/)).toBeDefined();
    });

    it("shows an empty state with no category spend", () => {
        render(<CategoriesGrid categories={[]} />);
        expect(screen.getByText(/no category spend this month/i)).toBeDefined();
    });
});
