import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

// CategoryStats embeds the client editor, which imports the server action (and
// its auth/db chain) + useRouter — stub both so this stays a pure unit test.
vi.mock("@/app/_actions/category/set-budget", () => ({
    setCategoryBudget: vi.fn(),
}));
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn() }),
}));

import { CategoryStats } from "@/components/category/CategoryStats";

const base = {
    slug: "health",
    month: "2026-06",
    monthLabel: "June 2026",
    categoryName: "Health",
    color: "#0d9488",
    spent: 3920,
    limit: 4000,
    defaultBudget: 4000,
    thisMonthOverride: null,
    hasLimit: true,
    remaining: 80,
    over: false,
    pctOfLimit: 98,
    daysLeft: 7,
    expenseCount: 5,
    subcatWithSpend: 4,
};

/** The desktop layout (three cards + progress line). */
function desktop() {
    return within(screen.getByTestId("category-stats-desktop"));
}
/** The mobile hero layout. */
function mobile() {
    return within(screen.getByTestId("category-stats-mobile"));
}
/** Whitespace-normalized text of the composed progress line (desktop only). */
function progressText(): string {
    return screen
        .getByTestId("category-progress")
        .textContent!.replace(/\s+/g, " ")
        .trim();
}

describe("CategoryStats", () => {
    it("renders the three desktop stat cards and the progress line", () => {
        render(<CategoryStats {...base} />);
        expect(desktop().getByText("$3,920.00")).toBeDefined();
        expect(desktop().getByText("$4,000.00")).toBeDefined();
        expect(desktop().getByText("$80.00")).toBeDefined();
        expect(progressText()).toBe(
            "98% of limit · 7 days left · 5 expenses across 4 subcategories",
        );
    });

    it("shows a negative remaining when over budget", () => {
        render(
            <CategoryStats
                {...base}
                spent={4200}
                limit={4000}
                remaining={-200}
                over={true}
                pctOfLimit={105}
            />,
        );
        expect(desktop().getByText("−$200.00")).toBeDefined();
        expect(progressText()).toContain("105% of limit");
    });

    it("reads 'No limit' and drops the % when there's no budget", () => {
        render(
            <CategoryStats
                {...base}
                limit={null}
                defaultBudget={null}
                hasLimit={false}
                remaining={null}
                pctOfLimit={0}
            />,
        );
        expect(desktop().getByText("No limit")).toBeDefined();
        expect(desktop().getByText("—")).toBeDefined();
        expect(progressText()).not.toContain("% of limit");
        expect(progressText()).toBe(
            "7 days left · 5 expenses across 4 subcategories",
        );
        // Mobile hero also reflects "No limit set".
        expect(mobile().getByText(/No limit set/)).toBeDefined();
    });

    it("uses singular nouns for a single expense and subcategory", () => {
        render(
            <CategoryStats {...base} expenseCount={1} subcatWithSpend={1} />,
        );
        expect(progressText()).toContain("1 expense across 1 subcategory");
    });

    it("renders a mobile hero with the amount + limit subtitle", () => {
        render(<CategoryStats {...base} />);
        expect(mobile().getByText("$3,920.00")).toBeDefined();
        expect(
            mobile().getByText(/\$80\.00 left of your \$4,000\.00 limit/),
        ).toBeDefined();
    });

    it("exposes an Edit-limit control (both layouts)", () => {
        render(<CategoryStats {...base} />);
        // One editor per layout (desktop card + mobile hero).
        expect(
            screen.getAllByRole("button", { name: /edit limit/i }),
        ).toHaveLength(2);
    });
});
