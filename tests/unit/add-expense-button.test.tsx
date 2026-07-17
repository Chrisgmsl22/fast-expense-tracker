import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn() }),
}));
// Stub the forms so this test stays about the Add menu's items (and avoids the
// forms' server-action → auth/db imports).
vi.mock("@/components/expense/ExpenseForm", () => ({
    ExpenseForm: () => <div data-testid="expense-form" />,
}));
vi.mock("@/components/movement/CardPaymentForm", () => ({
    CardPaymentForm: () => <div data-testid="card-payment-form" />,
}));
vi.mock("@/components/movement/TransferForm", () => ({
    TransferForm: () => <div data-testid="transfer-form" />,
}));

import { AddExpenseButton } from "@/components/expense/AddExpenseButton";

const props = {
    categories: [],
    subcategories: [],
    cards: [],
    defaultSharePercentage: 0.68,
    partnerName: "Brenda",
};

function openMenu() {
    fireEvent.click(screen.getByRole("button", { name: /\+ add/i }));
}

describe("AddExpenseButton", () => {
    it("shows the partner transfer items in Shared mode", () => {
        render(<AddExpenseButton {...props} sharesExpenses />);
        openMenu();
        expect(screen.getByText("Expense")).toBeDefined();
        expect(screen.getByText("Card payment")).toBeDefined();
        expect(screen.getByText("I paid Brenda")).toBeDefined();
        expect(screen.getByText("Brenda paid me")).toBeDefined();
    });

    it("hides the partner transfer items in Solo mode (CHORE-6.b)", () => {
        render(<AddExpenseButton {...props} sharesExpenses={false} />);
        openMenu();
        // Non-partner options remain.
        expect(screen.getByText("Expense")).toBeDefined();
        expect(screen.getByText("Card payment")).toBeDefined();
        // Partner money movements are gone.
        expect(screen.queryByText("I paid Brenda")).toBeNull();
        expect(screen.queryByText("Brenda paid me")).toBeNull();
    });
});
