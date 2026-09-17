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
        render(
            <SubcategoryBreakdown
                bars={bars}
                color="#0d9488"
                spentNotFromIncome={0}
            />,
        );
        expect(screen.getByText("Spend by subcategory")).toBeDefined();
        expect(rowText("Doctors appt")).toContain("$1,400.00");
        expect(rowText("Doctors appt")).toContain("36%");
        expect(rowText("Dentist")).toContain("$1,100.00");
    });

    it("collapses zero-spend subcategories into a faint footer, not bars", () => {
        render(
            <SubcategoryBreakdown
                bars={bars}
                color="#0d9488"
                spentNotFromIncome={0}
            />,
        );
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
                spentNotFromIncome={0}
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
                spentNotFromIncome={0}
            />,
        );
        expect(
            screen.getByText(/no spend in this category this month/i),
        ).toBeDefined();
        // The footer would only repeat the empty state with a list of names.
        expect(screen.queryByTestId("breakdown-zero")).toBeNull();
    });

    it("says WHY it is empty when the filter took the month's only row", () => {
        // The bars are empty because of the funding filter, not because the
        // month was; "no spend this month" would contradict the header above it
        // and the list below it.
        render(
            <SubcategoryBreakdown
                bars={[{ id: "s1", name: "Shoes", spent: 0, pct: 0 }]}
                color="#0d9488"
                spentNotFromIncome={3000}
            />,
        );
        const empty = screen.getByTestId("breakdown-empty").textContent!;
        expect(empty).not.toMatch(/no spend in this category this month/i);
        expect(empty).toContain("No spend from this month's income");
        // Points at the header line by its exact wording, so the two agree.
        expect(empty).toContain("Not from this month's income");
        // And no "Shoes — $0" beneath it: that money is exactly what's missing.
        expect(screen.queryByText(/— \$0/)).toBeNull();
        // The scope line goes too. There are no bars, so there are no amounts
        // and no percents for it to scope — it would promise content that the
        // empty state below it says is absent.
        expect(screen.queryByTestId("breakdown-scope")).toBeNull();
    });

    /** SOME income-funded spend plus savings-funded spend in a subcategory the filter emptied: `withSpend.length > 0`, so the empty state never renders. */
    describe("a month mixing income-funded and savings-funded spend", () => {
        // Dining out holds $238 of income-funded my-share; Entertainment holds
        // a $3,700 savings-funded row the filter zeroed out.
        const mixed: SubcategoryBar[] = [
            { id: "s1", name: "Dining out", spent: 238, pct: 100 },
            { id: "s2", name: "Entertainment", spent: 0, pct: 0 },
            { id: "s3", name: "Hobbies", spent: 0, pct: 0 },
        ];

        function renderMixed() {
            render(
                <SubcategoryBreakdown
                    bars={mixed}
                    color="#0d9488"
                    spentNotFromIncome={3700}
                />,
            );
        }

        it("never prints a bare $0 for a subcategory holding the money", () => {
            renderMixed();
            // "Entertainment — $0" would sit directly above a $3,700 Entertainment row.
            expect(screen.queryByText(/Entertainment — \$0/)).toBeNull();
            expect(screen.queryByText(/— \$0/)).toBeNull();
        });

        it("scopes the footer to income-funded spend and keeps the names", () => {
            renderMixed();
            const footer = screen
                .getByTestId("breakdown-zero")
                .textContent!.replace(/\s+/g, " ");
            expect(footer).toContain("No spend from this month's income in:");
            expect(footer).toContain("Entertainment");
            expect(footer).toContain("Hobbies");
        });

        it("says what the amounts and the percent are a share OF", () => {
            renderMixed();
            // "$238.00 · 100%" is 100% of income-funded spend, not of the
            // category — which really holds $3,938 of my-share spend.
            expect(rowText("Dining out")).toContain("100%");
            expect(screen.getByTestId("breakdown-scope").textContent).toContain(
                "spend from this month's income only",
            );
        });

        it("drops the decorative caption, which would be false here", () => {
            renderMixed();
            // "where the money actually went" over a filtered set is a lie:
            // $3,700 of it went somewhere this section doesn't show.
            expect(
                screen.queryByText(/where the money actually went/),
            ).toBeNull();
        });

        it("keeps the plain caption and the $0 amounts when nothing was filtered", () => {
            render(
                <SubcategoryBreakdown
                    bars={mixed}
                    color="#0d9488"
                    spentNotFromIncome={0}
                />,
            );
            expect(
                screen.getByText(/where the money actually went/),
            ).toBeDefined();
            expect(screen.queryByTestId("breakdown-scope")).toBeNull();
            // With no filtered money, "$0" is simply true.
            expect(screen.getByText(/Entertainment — \$0/)).toBeDefined();
        });
    });
});
