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
// list's filter/edit/delete wiring (and avoids the form's server-action imports).
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
        category: { id: "c1", slug: "food", name: "Food", color: "#ef4444" },
        subcategory: { name: "Restaurants" },
        card: { name: "Amex", color: "#ca8a04" },
    },
    {
        id: "e2",
        date: new Date("2026-05-12T06:00:00Z"),
        description: "Uber",
        amount: 1000,
        actualExpenditure: 1000,
        isShared: false,
        category: {
            id: "c2",
            slug: "transport",
            name: "Transport",
            color: "#7c3aed",
        },
        subcategory: null,
        card: null,
    },
];

const props = {
    categories: [{ id: "c1", slug: "food", name: "Food", color: "#ef4444" }],
    subcategories: [{ id: "s1", name: "Restaurants", categoryId: "c1" }],
    cards: [{ id: "card1", name: "Amex", color: "#ca8a04" }],
    defaultSharePercentage: 0.68,
    monthLabel: "May 2026",
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

    it("renders my-share for shared rows and 'not shared' otherwise", () => {
        render(<ExpenseListInteractive expenses={expenses} {...props} />);
        expect(screen.getByText("my share $136.00")).toBeDefined();
        expect(screen.getByText("not shared")).toBeDefined();
    });

    it("falls back to a Cash label for a null card", () => {
        render(<ExpenseListInteractive expenses={expenses} {...props} />);
        // Uber has no card → rendered as Cash (desktop card cell + mobile subline).
        expect(screen.getAllByText("Cash").length).toBeGreaterThan(0);
    });

    it("renders no card (—, never Cash) for a savings row", () => {
        const savings = [
            {
                id: "sv1",
                date: new Date("2026-05-02T06:00:00Z"),
                description: "Emergency fund",
                amount: 5000,
                actualExpenditure: 5000,
                isShared: false,
                category: {
                    id: "cs",
                    slug: "savings",
                    name: "Savings",
                    color: "#0d9488",
                },
                subcategory: null,
                card: null,
            },
        ];
        render(<ExpenseListInteractive expenses={savings} {...props} />);
        expect(screen.getByText("Emergency fund")).toBeDefined();
        // Savings is a transfer — no card, and must not show the Cash fallback.
        expect(screen.queryByText("Cash")).toBeNull();
        expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    });

    it("totals Charged and My-share over the visible rows", () => {
        render(<ExpenseListInteractive expenses={expenses} {...props} />);
        const totals = screen.getByTestId("totals-desktop");
        // Charged = 200 + 1000; My-share = 136 + 1000.
        expect(within(totals).getByText("$1,200.00")).toBeDefined();
        expect(within(totals).getByText("$1,136.00")).toBeDefined();
    });

    it("filters rows by category chip and retotals", () => {
        render(<ExpenseListInteractive expenses={expenses} {...props} />);
        expect(screen.getByText("Tacos")).toBeDefined();
        expect(screen.getByText("Uber")).toBeDefined();

        fireEvent.click(screen.getByRole("button", { name: "Food" }));

        expect(screen.getByText("Tacos")).toBeDefined();
        expect(screen.queryByText("Uber")).toBeNull();
        // Footer now reflects only Tacos (charged 200, my-share 136).
        const totals = screen.getByTestId("totals-desktop");
        expect(within(totals).getByText("$200.00")).toBeDefined();
        expect(within(totals).getByText("$136.00")).toBeDefined();

        // "All" restores both rows.
        fireEvent.click(screen.getByRole("button", { name: "All" }));
        expect(screen.getByText("Uber")).toBeDefined();
    });

    it("falls back to All when the active category disappears after a refresh", () => {
        const { rerender } = render(
            <ExpenseListInteractive expenses={expenses} {...props} />,
        );
        fireEvent.click(screen.getByRole("button", { name: "Food" }));
        expect(screen.queryByText("Uber")).toBeNull();

        // The only Food row is deleted; a refresh re-renders without it.
        rerender(
            <ExpenseListInteractive expenses={[expenses[1]!]} {...props} />,
        );

        // No stale empty view: the remaining row shows and "All" is active again.
        expect(screen.getByText("Uber")).toBeDefined();
        expect(screen.getByRole("button", { name: "All" })).toHaveProperty(
            "ariaPressed",
            "true",
        );
        expect(screen.queryByText(/no expenses in this category/i)).toBeNull();
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
        expect(refreshMock).not.toHaveBeenCalled();
        expect(
            within(dialog).getByRole("button", { name: "Delete" }),
        ).toBeDefined();
    });
});
