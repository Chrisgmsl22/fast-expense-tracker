import { describe, it, expect, vi, type Mock } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Isolate the component from the server actions (and their auth/db imports).
vi.mock("@/app/_actions/expense/create", () => ({ createExpense: vi.fn() }));
vi.mock("@/app/_actions/expense/update", () => ({ updateExpense: vi.fn() }));

import { ExpenseForm } from "@/components/expense/ExpenseForm";
import { updateExpense } from "@/app/_actions/expense/update";

const categories = [{ id: "c1", name: "Food" }];
const subcategories = [{ id: "s1", name: "Groceries", categoryId: "c1" }];
const cards = [{ id: "card1", name: "Amex" }];

const editable = {
    id: "e1",
    date: new Date("2026-05-20T06:00:00Z"),
    amount: 250,
    categoryId: "c1",
    subcategoryId: "s1",
    cardId: "card1",
    description: "Tacos",
    notes: null,
    isShared: true,
    yourPercentage: 0.68,
    paidBy: "you",
};

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

    it("prefills fields and switches to 'Save changes' in edit mode", () => {
        render(
            <ExpenseForm
                categories={categories}
                subcategories={subcategories}
                cards={cards}
                expense={editable}
            />,
        );
        expect(
            (screen.getByLabelText(/description/i) as HTMLInputElement).value,
        ).toBe("Tacos");
        expect(
            (screen.getByLabelText(/amount/i) as HTMLInputElement).value,
        ).toBe("250");
        expect((screen.getByLabelText(/date/i) as HTMLInputElement).value).toBe(
            "2026-05-20",
        );
        // isShared starts true → the share field is visible and prefilled.
        expect(
            (screen.getByLabelText(/your share/i) as HTMLInputElement).value,
        ).toBe("0.68");
        expect(
            screen.getByRole("button", { name: /save changes/i }),
        ).toBeDefined();
    });

    it("submits edits through updateExpense, carrying the id", async () => {
        (updateExpense as unknown as Mock).mockResolvedValue({
            ok: true,
            data: { id: "e1" },
        });
        const onSuccess = vi.fn();
        render(
            <ExpenseForm
                categories={categories}
                subcategories={subcategories}
                cards={cards}
                expense={editable}
                onSuccess={onSuccess}
            />,
        );
        fireEvent.submit(screen.getByRole("form", { name: /edit expense/i }));
        await waitFor(() =>
            expect(updateExpense).toHaveBeenCalledWith(
                expect.objectContaining({ id: "e1", description: "Tacos" }),
            ),
        );
        await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    });
});
