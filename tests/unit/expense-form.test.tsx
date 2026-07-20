import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import {
    render,
    screen,
    fireEvent,
    waitFor,
    within,
} from "@testing-library/react";

// Isolate the component from the server actions (and their auth/db imports).
vi.mock("@/app/_actions/expense/create", () => ({ createExpense: vi.fn() }));
vi.mock("@/app/_actions/expense/update", () => ({ updateExpense: vi.fn() }));

import { ExpenseForm } from "@/components/expense/ExpenseForm";
import { createExpense } from "@/app/_actions/expense/create";
import { updateExpense } from "@/app/_actions/expense/update";

const categories = [
    { id: "c1", slug: "food", name: "Food", color: "#ef4444" },
    { id: "c2", slug: "health", name: "Health", color: "#14b8a6" },
    { id: "c3", slug: "savings", name: "Savings", color: "#0d9488" },
];
const subcategories = [
    { id: "s1", name: "Groceries", categoryId: "c1" },
    { id: "s2", name: "Doctors appt", categoryId: "c2" },
];
const cards = [{ id: "card1", name: "Amex", color: "#9ca3af" }];

const editable = {
    id: "e1",
    date: new Date("2026-05-20T06:00:00Z"),
    amount: 250,
    categoryId: "c2",
    subcategoryId: "s2",
    cardId: "card1",
    description: "Tacos",
    notes: null,
    isShared: true,
    yourPercentage: 0.68,
    paidBy: "you",
};

function renderForm(props?: Partial<Parameters<typeof ExpenseForm>[0]>) {
    return render(
        <ExpenseForm
            categories={categories}
            subcategories={subcategories}
            cards={cards}
            defaultSharePercentage={0.68}
            sharesExpenses
            {...props}
        />,
    );
}

beforeEach(() => {
    (createExpense as unknown as Mock).mockReset();
    (updateExpense as unknown as Mock).mockReset();
});

describe("ExpenseForm", () => {
    it("renders the capture fields in the design's order", () => {
        renderForm();
        expect(screen.getByLabelText(/date/i)).toBeDefined();
        expect(screen.getByLabelText(/amount/i)).toBeDefined();
        expect(screen.getByLabelText(/^category$/i)).toBeDefined();
        expect(screen.getByLabelText(/^subcategory$/i)).toBeDefined();
        expect(screen.getByLabelText(/^card$/i)).toBeDefined();
        expect(screen.getByLabelText(/description/i)).toBeDefined();
        expect(
            screen.getByRole("checkbox", { name: /shared expense/i }),
        ).toBeDefined();
    });

    it("no longer renders a 'Paid by' control (every expense is the user's, ADR-0018)", () => {
        renderForm();
        expect(screen.queryByLabelText(/paid by/i)).toBeNull();
    });

    it("disables the subcategory select until a category is chosen", () => {
        renderForm();
        expect(screen.getByLabelText(/^subcategory$/i)).toHaveProperty(
            "disabled",
            true,
        );
    });

    it("reveals a live 'your share' only when shared is checked", () => {
        renderForm();
        fireEvent.change(screen.getByLabelText(/amount/i), {
            target: { value: "100" },
        });
        expect(screen.queryByText(/your share/i)).toBeNull();

        fireEvent.click(
            screen.getByRole("checkbox", { name: /shared expense/i }),
        );

        // 100 × 0.68 = 68 → formatted as MXN.
        expect(screen.getByText("your share $68.00")).toBeDefined();
    });

    it("labels the split from the configured percentage", () => {
        renderForm({ defaultSharePercentage: 0.5 });
        expect(screen.getByText("Shared expense · 50/50")).toBeDefined();
    });

    it("prefills, preserves the stored split, and switches to 'Save changes' in edit mode", () => {
        // Configured default differs from the stored row — edit must keep 0.68.
        renderForm({ expense: editable, defaultSharePercentage: 0.5 });

        expect(
            (screen.getByLabelText(/description/i) as HTMLInputElement).value,
        ).toBe("Tacos");
        expect(
            (screen.getByLabelText(/amount/i) as HTMLInputElement).value,
        ).toBe("250");
        expect((screen.getByLabelText(/date/i) as HTMLInputElement).value).toBe(
            "2026-05-20",
        );
        // Stored 0.68 split is preserved, not overridden by the 0.5 default.
        expect(screen.getByText("Shared expense · 68/32")).toBeDefined();
        // 250 × 0.68 = 170.
        expect(screen.getByText("your share $170.00")).toBeDefined();
        expect(
            screen.getByRole("button", { name: /save changes/i }),
        ).toBeDefined();
    });

    it("submits new captures through createExpense", async () => {
        (createExpense as unknown as Mock).mockResolvedValue({
            ok: true,
            data: { id: "new1" },
        });
        const onSuccess = vi.fn();
        renderForm({ onSuccess });

        fireEvent.change(screen.getByLabelText(/description/i), {
            target: { value: "Coffee" },
        });
        fireEvent.change(screen.getByLabelText(/amount/i), {
            target: { value: "45" },
        });
        fireEvent.submit(screen.getByRole("form", { name: /add expense/i }));

        await waitFor(() =>
            expect(createExpense).toHaveBeenCalledWith(
                expect.objectContaining({
                    description: "Coffee",
                    amount: "45",
                }),
            ),
        );
        await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    });

    it("enables the subcategory and shows the stored value in edit mode", () => {
        renderForm({ expense: editable });
        const subcategory = screen.getByLabelText(/^subcategory$/i);
        expect(subcategory).toHaveProperty("disabled", false);
        // Stored subcategory (s2, belongs to the edited category c2) is shown.
        expect(within(subcategory).getByText("Doctors appt")).toBeDefined();
    });

    it("uses the configured split when an unshared row is newly marked shared", async () => {
        // An unshared row stores yourPercentage = 1; ticking Shared must adopt the
        // configured split (not carry the 100% that the schema would reject).
        const unsharedRow = {
            ...editable,
            isShared: false,
            yourPercentage: 1,
        };
        (updateExpense as unknown as Mock).mockResolvedValue({
            ok: true,
            data: { id: "e1" },
        });
        renderForm({ expense: unsharedRow, defaultSharePercentage: 0.68 });

        // Label reflects the configured split, never "100/0".
        expect(screen.getByText("Shared expense · 68/32")).toBeDefined();

        fireEvent.click(
            screen.getByRole("checkbox", { name: /shared expense/i }),
        );
        fireEvent.submit(screen.getByRole("form", { name: /edit expense/i }));

        await waitFor(() =>
            expect(updateExpense).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: "e1",
                    isShared: true,
                    yourPercentage: "0.68",
                }),
            ),
        );
    });

    it("submits edits through updateExpense, carrying the id", async () => {
        (updateExpense as unknown as Mock).mockResolvedValue({
            ok: true,
            data: { id: "e1" },
        });
        const onSuccess = vi.fn();
        renderForm({ expense: editable, onSuccess });

        fireEvent.submit(screen.getByRole("form", { name: /edit expense/i }));

        await waitFor(() =>
            expect(updateExpense).toHaveBeenCalledWith(
                expect.objectContaining({ id: "e1", description: "Tacos" }),
            ),
        );
        await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    });

    it("hides the shared/split control in Solo mode (CHORE-6.b)", () => {
        renderForm({ sharesExpenses: false });
        expect(
            screen.queryByRole("checkbox", { name: /shared expense/i }),
        ).toBeNull();
    });

    it("saves a new Solo expense at 100% mine (isShared:false, yourPercentage:1)", async () => {
        (createExpense as unknown as Mock).mockResolvedValue({
            ok: true,
            data: { id: "new1" },
        });
        renderForm({ sharesExpenses: false });

        fireEvent.change(screen.getByLabelText(/description/i), {
            target: { value: "Coffee" },
        });
        fireEvent.change(screen.getByLabelText(/amount/i), {
            target: { value: "45" },
        });
        fireEvent.submit(screen.getByRole("form", { name: /add expense/i }));

        await waitFor(() =>
            expect(createExpense).toHaveBeenCalledWith(
                expect.objectContaining({
                    amount: "45",
                    isShared: false,
                    yourPercentage: "1",
                }),
            ),
        );
    });

    it("preserves a historical shared row's split when edited in Solo mode (ADR-0021)", async () => {
        (updateExpense as unknown as Mock).mockResolvedValue({
            ok: true,
            data: { id: "e1" },
        });
        // A Solo user editing an old shared expense must not rewrite its split.
        renderForm({ expense: editable, sharesExpenses: false });

        // The split control is hidden even though the row is shared.
        expect(
            screen.queryByRole("checkbox", { name: /shared expense/i }),
        ).toBeNull();

        fireEvent.submit(screen.getByRole("form", { name: /edit expense/i }));

        await waitFor(() =>
            expect(updateExpense).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: "e1",
                    isShared: true,
                    yourPercentage: "0.68",
                }),
            ),
        );
    });

    it("disables the card field for the Savings category (a transfer, no card)", () => {
        renderForm({
            expense: {
                ...editable,
                categoryId: "c3", // savings
                cardId: null,
            },
        });
        // The "Savings — no card" placeholder + hint render only in the savings
        // branch, which is exactly where the card Select is disabled.
        expect(screen.getByText("Savings — no card")).toBeDefined();
        expect(screen.getByText(/not needed for savings/i)).toBeDefined();
    });

    it("nulls the card when saving a savings row that still carries one", async () => {
        (updateExpense as unknown as Mock).mockResolvedValue({
            ok: true,
            data: { id: "e1" },
        });
        // Legacy savings row edited: it has a card, but savings must save with none.
        renderForm({
            expense: { ...editable, categoryId: "c3", cardId: "card1" },
        });

        fireEvent.submit(screen.getByRole("form", { name: /edit expense/i }));

        await waitFor(() =>
            expect(updateExpense).toHaveBeenCalledWith(
                expect.objectContaining({ id: "e1", cardId: undefined }),
            ),
        );
    });
});
