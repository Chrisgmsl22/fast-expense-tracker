import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import {
    render,
    screen,
    fireEvent,
    waitFor,
    within,
} from "@testing-library/react";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: refreshMock }),
}));
vi.mock("@/app/_actions/expense/delete", () => ({ deleteExpense: vi.fn() }));
vi.mock("@/app/_actions/expense/get-for-edit", () => ({
    getExpenseForEdit: vi.fn(),
}));
// The form is covered by its own test; stub it so this test stays about the
// list's edit/delete wiring (and avoids the form's server-action imports).
vi.mock("@/components/expense/ExpenseForm", () => ({
    ExpenseForm: ({
        expense,
        onSuccess,
    }: {
        expense?: { id: string };
        onSuccess?: () => void;
    }) => (
        <div data-testid="expense-form">
            <span>editing {expense?.id}</span>
            <button type="button" onClick={() => onSuccess?.()}>
                save
            </button>
        </div>
    ),
}));

import { ExpenseListInteractive } from "@/components/expense/ExpenseListInteractive";
import { deleteExpense } from "@/app/_actions/expense/delete";
import { getExpenseForEdit } from "@/app/_actions/expense/get-for-edit";

beforeEach(() => {
    refreshMock.mockReset();
    (deleteExpense as unknown as Mock).mockReset();
    (getExpenseForEdit as unknown as Mock).mockReset();
});

const expenses = [
    {
        id: "e1",
        date: new Date("2026-05-15T06:00:00Z"),
        description: "Tacos",
        amount: 200,
        actualExpenditure: 136,
        isShared: true,
        category: { name: "Food" },
        subcategory: { name: "Restaurants" },
        card: { name: "Amex" },
    },
];

const props = {
    categories: [{ id: "c1", name: "Food", color: "#ef4444" }],
    subcategories: [{ id: "s1", name: "Restaurants", categoryId: "c1" }],
    cards: [{ id: "card1", name: "Amex", color: "#9ca3af" }],
    defaultSharePercentage: 0.68,
};

describe("ExpenseListInteractive", () => {
    it("shows the empty state when there are no expenses", () => {
        render(<ExpenseListInteractive expenses={[]} {...props} />);
        expect(screen.getByText(/no expenses for this month/i)).toBeDefined();
    });

    it("renders a row with per-row edit + delete actions", () => {
        render(<ExpenseListInteractive expenses={expenses} {...props} />);
        expect(screen.getByText("Tacos")).toBeDefined();
        expect(
            screen.getByRole("button", { name: "Edit Tacos" }),
        ).toBeDefined();
        expect(
            screen.getByRole("button", { name: "Delete Tacos" }),
        ).toBeDefined();
    });

    it("fetches the row then opens a prefilled edit dialog", async () => {
        (getExpenseForEdit as unknown as Mock).mockResolvedValue({ id: "e1" });
        render(<ExpenseListInteractive expenses={expenses} {...props} />);

        fireEvent.click(screen.getByRole("button", { name: "Edit Tacos" }));

        await waitFor(() =>
            expect(getExpenseForEdit).toHaveBeenCalledWith("e1"),
        );
        expect(await screen.findByText(/editing e1/i)).toBeDefined();
    });

    it("deletes after confirming, then refreshes", async () => {
        (deleteExpense as unknown as Mock).mockResolvedValue({
            ok: true,
            data: { id: "e1" },
        });
        render(<ExpenseListInteractive expenses={expenses} {...props} />);

        fireEvent.click(screen.getByRole("button", { name: "Delete Tacos" }));
        expect(
            await screen.findByText(/will be permanently removed/i),
        ).toBeDefined();

        // The confirm button's accessible name is exactly "Delete" (row buttons
        // carry the description), so this targets the dialog's confirm.
        fireEvent.click(screen.getByRole("button", { name: "Delete" }));

        await waitFor(() =>
            expect(deleteExpense).toHaveBeenCalledWith({ id: "e1" }),
        );
        await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    });

    it("surfaces the error and keeps the dialog open when delete fails", async () => {
        (deleteExpense as unknown as Mock).mockResolvedValue({
            ok: false,
            code: "db_error",
            message: "Could not delete the expense. Please try again.",
        });
        render(<ExpenseListInteractive expenses={expenses} {...props} />);

        fireEvent.click(screen.getByRole("button", { name: "Delete Tacos" }));
        fireEvent.click(await screen.findByRole("button", { name: "Delete" }));

        await waitFor(() => expect(deleteExpense).toHaveBeenCalled());
        const dialog = await screen.findByRole("dialog", {
            name: /delete expense/i,
        });
        await waitFor(() =>
            expect(
                within(dialog).getByText(/could not delete the expense/i),
            ).toBeDefined(),
        );
        // No refresh on failure, and the confirm dialog stays open to retry.
        expect(refreshMock).not.toHaveBeenCalled();
        expect(
            within(dialog).getByRole("button", { name: "Delete" }),
        ).toBeDefined();
    });
});
