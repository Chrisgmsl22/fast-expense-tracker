import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Isolate the component from the server action (and its auth/db imports).
vi.mock("@/app/_actions/expense/create", () => ({ createExpense: vi.fn() }));

import { ExpenseForm } from "@/components/expense/ExpenseForm";

const categories = [{ id: "c1", name: "Food" }];
const subcategories = [{ id: "s1", name: "Groceries", categoryId: "c1" }];
const cards = [{ id: "card1", name: "Amex" }];

function renderForm() {
    return render(
        <ExpenseForm
            categories={categories}
            subcategories={subcategories}
            cards={cards}
        />,
    );
}

describe("ExpenseForm", () => {
    it("renders the core capture fields including paidBy", () => {
        renderForm();
        expect(screen.getByLabelText(/date/i)).toBeDefined();
        expect(screen.getByLabelText(/amount/i)).toBeDefined();
        expect(screen.getByLabelText(/^category$/i)).toBeDefined();
        expect(screen.getByLabelText(/paid by/i)).toBeDefined();
        expect(screen.getByLabelText(/description/i)).toBeDefined();
        // Options come through from props.
        expect(screen.getByRole("option", { name: "Food" })).toBeDefined();
        expect(screen.getByRole("option", { name: "Amex" })).toBeDefined();
    });

    it("offers both payers for paidBy", () => {
        renderForm();
        expect(screen.getByRole("option", { name: "You" })).toBeDefined();
        expect(
            screen.getByRole("option", { name: "Girlfriend" }),
        ).toBeDefined();
    });

    it("reveals the share field only when 'Shared expense' is checked", () => {
        renderForm();
        expect(screen.queryByLabelText(/your share/i)).toBeNull();
        fireEvent.click(screen.getByLabelText(/shared expense/i));
        expect(screen.getByLabelText(/your share/i)).toBeDefined();
    });
});
