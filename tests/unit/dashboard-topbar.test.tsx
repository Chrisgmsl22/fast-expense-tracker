import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
    usePathname: () => "/dashboard",
}));
// Stub the Add button so this test stays about the topbar's own chips (and
// avoids the button's form → server-action imports).
vi.mock("@/components/expense/AddExpenseButton", () => ({
    AddExpenseButton: () => <div data-testid="add-expense-button" />,
}));

import { DashboardTopbar } from "@/components/dashboard/DashboardTopbar";

const props = {
    month: "2026-06",
    monthLabel: "June 2026",
    incomeTotal: 50000,
    sharePercentage: 0.68,
    categories: [],
    subcategories: [],
    cards: [],
    partnerName: "Brenda",
};

describe("DashboardTopbar", () => {
    it("shows the 'My view · NN%' share pill in Shared mode", () => {
        render(<DashboardTopbar {...props} sharesExpenses />);
        expect(screen.getByText(/My view · 68%/)).toBeDefined();
    });

    it("hides the share pill in Solo mode (CHORE-6.b)", () => {
        render(<DashboardTopbar {...props} sharesExpenses={false} />);
        expect(screen.queryByText(/My view/)).toBeNull();
        // Non-partner content is unchanged.
        expect(screen.getByText("June 2026")).toBeDefined();
        expect(screen.getByText(/Total income/)).toBeDefined();
    });
});
