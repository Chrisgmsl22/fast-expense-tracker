import { describe, it, expect, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithIntl } from "@/tests/support/intl";

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
    spentNotFromIncome: 0,
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
        renderWithIntl(<CategoryStats {...base} />);
        expect(desktop().getByText("$3,920.00")).toBeDefined();
        expect(desktop().getByText("$4,000.00")).toBeDefined();
        expect(desktop().getByText("$80.00")).toBeDefined();
        expect(progressText()).toBe(
            "98% of limit · 7 days left · 5 expenses across 4 subcategories",
        );
    });

    it("shows a negative remaining when over budget", () => {
        renderWithIntl(
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
        renderWithIntl(
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
        renderWithIntl(
            <CategoryStats {...base} expenseCount={1} subcatWithSpend={1} />,
        );
        expect(progressText()).toContain("1 expense across 1 subcategory");
    });

    it("renders a mobile hero with the amount + limit subtitle", () => {
        renderWithIntl(<CategoryStats {...base} />);
        expect(mobile().getByText("$3,920.00")).toBeDefined();
        expect(
            mobile().getByText(/\$80\.00 left of your \$4,000\.00 limit/),
        ).toBeDefined();
    });

    it("explains money the header left out, when there is any", () => {
        // The $0-over-a-$3,000-row case: `spent` skips savings-funded rows, so
        // the header has to say so or it contradicts the list below it.
        renderWithIntl(
            <CategoryStats
                {...base}
                spent={0}
                spentNotFromIncome={3000}
                remaining={4000}
                pctOfLimit={0}
            />,
        );
        const line = screen.getByTestId("category-non-income").textContent!;
        expect(line).toContain("Not from this month's income: $3,000.00");
        // It must point at the LIST: the subcategory bars between the two are funding-filtered as well.
        expect(line).toContain("in the list below, outside the budget");
    });

    it("keeps the count sentence on the rows the user can see", () => {
        // The other half of the same contradiction: one savings-funded row must
        // not read "across 0 subcategories".
        renderWithIntl(
            <CategoryStats
                {...base}
                spent={0}
                spentNotFromIncome={3000}
                expenseCount={1}
                subcatWithSpend={1}
            />,
        );
        expect(progressText()).toContain("1 expense across 1 subcategory");
    });

    it("stays silent when every row is income-funded", () => {
        renderWithIntl(<CategoryStats {...base} />);
        expect(screen.queryByTestId("category-non-income")).toBeNull();
    });

    it("exposes an Edit-limit control (both layouts)", () => {
        renderWithIntl(<CategoryStats {...base} />);
        // One editor per layout (desktop card + mobile hero).
        expect(
            screen.getAllByRole("button", { name: /edit limit/i }),
        ).toHaveLength(2);
    });
});

describe("CategoryStats in Spanish", () => {
    it("composes the stats and progress line with Spanish plurals", () => {
        renderWithIntl(<CategoryStats {...base} />, { locale: "es" });
        expect(desktop().getByText("Gastado (mi parte)")).toBeDefined();
        expect(desktop().getByText("Límite mensual")).toBeDefined();
        expect(desktop().getByText("Restante")).toBeDefined();
        expect(progressText()).toBe(
            "98% del límite · quedan 7 días · 5 gastos en 4 subcategorías",
        );
        expect(
            mobile().getByText("Te quedan $80.00 de tu límite de $4,000.00"),
        ).toBeDefined();
    });

    it("uses the singular forms", () => {
        renderWithIntl(
            <CategoryStats
                {...base}
                daysLeft={1}
                expenseCount={1}
                subcatWithSpend={1}
            />,
            { locale: "es" },
        );
        expect(progressText()).toBe(
            "98% del límite · queda 1 día · 1 gasto en 1 subcategoría",
        );
    });

    it("names the spend outside this month's income in Spanish", () => {
        renderWithIntl(<CategoryStats {...base} spentNotFromIncome={500} />, {
            locale: "es",
        });
        expect(screen.getByTestId("category-non-income").textContent).toBe(
            "No salió del ingreso de este mes: $500.00 — en la lista de abajo, fuera del presupuesto.",
        );
    });

    it("reads a missing limit in Spanish", () => {
        renderWithIntl(
            <CategoryStats
                {...base}
                hasLimit={false}
                limit={null}
                remaining={null}
            />,
            { locale: "es" },
        );
        expect(desktop().getByText("Sin límite")).toBeDefined();
        expect(mobile().getByText("Sin límite definido")).toBeDefined();
    });
});
