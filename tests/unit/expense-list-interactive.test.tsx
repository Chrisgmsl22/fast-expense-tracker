import {
    describe,
    it,
    expect,
    vi,
    afterEach,
    beforeEach,
    type Mock,
} from "vitest";
import {
    act,
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
vi.mock("@/app/_actions/movement/delete", () => ({ deleteMovement: vi.fn() }));
vi.mock("@/app/_actions/expense/get-for-edit", () => ({
    getExpenseForEdit: vi.fn(),
}));
vi.mock("@/app/_actions/movement/get-for-edit", () => ({
    getMovementForEdit: vi.fn(),
}));
// The forms are covered by their own tests; stub them so this test stays about
// the list's filter/edit/delete wiring (and avoids the forms' server-action imports).
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
vi.mock("@/components/movement/CardPaymentForm", () => ({
    CardPaymentForm: ({ payment }: { payment?: { id: string } }) => (
        <div data-testid="card-payment-form">editing cp {payment?.id}</div>
    ),
}));
vi.mock("@/components/movement/TransferForm", () => ({
    TransferForm: ({ transfer }: { transfer?: { id: string } }) => (
        <div data-testid="transfer-form">editing tr {transfer?.id}</div>
    ),
}));
vi.mock("@/components/movement/PartnerDebtForm", () => ({
    PartnerDebtForm: ({ debt }: { debt?: { id: string } }) => (
        <div data-testid="partner-debt-form">editing debt {debt?.id}</div>
    ),
}));

import { ExpenseListInteractive } from "@/components/expense/ExpenseListInteractive";
import { deleteExpense } from "@/app/_actions/expense/delete";
import { deleteMovement } from "@/app/_actions/movement/delete";
import { getExpenseForEdit } from "@/app/_actions/expense/get-for-edit";
import { getMovementForEdit } from "@/app/_actions/movement/get-for-edit";
import type { CoupleBalance } from "@/lib/domain/settlement";
import type { MovementListItem } from "@/lib/repositories/movement.repository";

beforeEach(() => {
    refreshMock.mockReset();
    (deleteExpense as unknown as Mock).mockReset();
    (deleteMovement as unknown as Mock).mockReset();
    (getExpenseForEdit as unknown as Mock).mockReset();
    (getMovementForEdit as unknown as Mock).mockReset();
});

const expenses = [
    {
        id: "e1",
        date: new Date("2026-05-15T06:00:00Z"),
        description: "Tacos",
        amount: 200,
        actualExpenditure: 136,
        fundedFrom: "income" as const,
        isShared: true,
        isPartnerPayment: false,
        cycleClosedAt: null,
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
        fundedFrom: "income" as const,
        isShared: false,
        isPartnerPayment: false,
        cycleClosedAt: null,
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

const movements: MovementListItem[] = [
    {
        id: "mv1",
        date: new Date("2026-05-20T06:00:00Z"),
        amount: 800,
        type: "card_payment",
        card: { name: "Amex", color: "#ca8a04" },
        note: null,
        fundedFrom: "income",
        closedAt: null,
        cycleClosedAt: null,
    },
    {
        id: "mv2",
        date: new Date("2026-05-18T06:00:00Z"),
        amount: 300,
        type: "gf_paid",
        card: null,
        note: "netted",
        fundedFrom: "income",
        closedAt: null,
        cycleClosedAt: null,
    },
];

/** A thing the partner fronted that he owes back — never a cash outflow. */
const debt: MovementListItem = {
    id: "mv3",
    date: new Date("2026-05-16T06:00:00Z"),
    amount: 1500,
    type: "gf_fronted",
    card: null,
    note: "she covered the vet",
    fundedFrom: "income",
    closedAt: null,
    cycleClosedAt: null,
};

const props = {
    movements: [],
    categories: [{ id: "c1", slug: "food", name: "Food", color: "#ef4444" }],
    subcategories: [{ id: "s1", name: "Restaurants", categoryId: "c1" }],
    cards: [{ id: "card1", name: "Amex", color: "#ca8a04" }],
    defaultSharePercentage: 0.68,
    partnerName: "Brenda",
    sharesExpenses: true,
    monthLabel: "May 2026",
    isCurrentMonth: true,
};

describe("ExpenseListInteractive", () => {
    it("shows the empty state when there is nothing logged", () => {
        render(<ExpenseListInteractive expenses={[]} {...props} />);
        expect(
            screen.getByText(/nothing logged for this month/i),
        ).toBeDefined();
    });

    it("labels a partner payment, never Cash", () => {
        // A payment has no card, and the bare `?? "Cash"` fallback printed BUG-1's symptom here.
        render(
            <ExpenseListInteractive
                expenses={[
                    {
                        ...expenses[1]!,
                        id: "payment",
                        description: "Sushi",
                        card: null,
                        isPartnerPayment: true,
                    },
                ]}
                {...props}
            />,
        );

        expect(screen.getAllByText(/Paid Brenda/).length).toBeGreaterThan(0);
        expect(screen.queryByText(/\bCash\b/)).toBeNull();
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

    it("drops edit + delete on a row a closed settlement counted", () => {
        // The server refuses this write, so rendering the buttons offers a way out that
        // is not there — `SettlementJournal` already hides them on a locked row.
        const frozen = [
            {
                ...expenses[0]!,
                cycleClosedAt: new Date("2026-05-20T00:00:00Z"),
            },
        ];
        render(<ExpenseListInteractive expenses={frozen} {...props} />);

        expect(screen.getByText("Tacos")).toBeDefined();
        expect(screen.queryByRole("button", { name: "Edit Tacos" })).toBeNull();
        expect(
            screen.queryByRole("button", { name: "Delete Tacos" }),
        ).toBeNull();
        expect(screen.getByText(/is locked/i)).toBeDefined();
    });

    it("keeps edit + delete on a SOLO row of the same age", () => {
        // A closed cycle counted nothing of a solo row, so nothing freezes it. Hiding
        // its controls would lock the whole history behind the first close.
        const solo = [
            {
                ...expenses[1]!,
                cycleClosedAt: new Date("2026-05-20T00:00:00Z"),
            },
        ];
        render(<ExpenseListInteractive expenses={solo} {...props} />);

        expect(screen.getByRole("button", { name: "Edit Uber" })).toBeDefined();
        expect(
            screen.getByRole("button", { name: "Delete Uber" }),
        ).toBeDefined();
    });

    it("drops edit + delete on the TRANSFER that closed a cycle, keeping them on an open movement beside it", () => {
        // The cycle marker is a `gf_paid` transfer and `buildFeed` keeps it, so it
        // renders here — with writes the server refuses.
        const closedAt = new Date("2026-05-20T00:00:00Z");
        const marked: MovementListItem[] = [
            movements[0]!,
            // A marker is inside the cycle it closed, so it carries BOTH facts.
            { ...movements[1]!, closedAt, cycleClosedAt: closedAt },
        ];
        render(
            <ExpenseListInteractive
                expenses={[]}
                {...{ ...props, movements: marked }}
            />,
        );

        expect(screen.getByText("Paid Brenda")).toBeDefined();
        expect(
            screen.queryByRole("button", { name: "Edit Paid Brenda" }),
        ).toBeNull();
        expect(
            screen.queryByRole("button", { name: "Delete Paid Brenda" }),
        ).toBeNull();
        expect(screen.getByText(/is locked/i)).toBeDefined();

        // The card payment is the same age and in no cycle, so it keeps its
        // controls — the freeze is a cycle's, not the month's.
        expect(
            screen.getByRole("button", { name: "Edit Card payment" }),
        ).toBeDefined();
        expect(
            screen.getByRole("button", { name: "Delete Card payment" }),
        ).toBeDefined();
    });

    // A cycle counts every transfer in it, so membership is the predicate; `closedAt`
    // only names the marker.
    it("drops the controls on a NON-marker transfer inside a closed cycle, not on a card payment of the same cycle", () => {
        const cycleClosedAt = new Date("2026-05-21T00:00:00Z");
        const inClosedCycle: MovementListItem[] = [
            // A card payment moves no settlement balance, so a closed cycle
            // never counted it and it stays editable at any age.
            { ...movements[0]!, cycleClosedAt },
            // A transfer with no marker of its own — counted by the cycle all
            // the same.
            { ...movements[1]!, closedAt: null, cycleClosedAt },
        ];
        render(
            <ExpenseListInteractive
                expenses={[]}
                {...{ ...props, movements: inClosedCycle }}
            />,
        );

        expect(
            screen.queryByRole("button", { name: "Edit Paid Brenda" }),
        ).toBeNull();
        expect(
            screen.queryByRole("button", { name: "Delete Paid Brenda" }),
        ).toBeNull();
        // It did not close anything, so the reason must not claim it did.
        expect(
            screen.getByText(/counts in a settlement you already closed/i),
        ).toBeDefined();

        expect(
            screen.getByRole("button", { name: "Edit Card payment" }),
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
                fundedFrom: "income" as const,
                isShared: false,
                isPartnerPayment: false,
                cycleClosedAt: null,
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
        const totals = screen.getByTestId("totals-footer");
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
        const totals = screen.getByTestId("totals-footer");
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
        // The confirm button label flips "Deleting…" → "Delete" when the pending
        // transition settles; await it so the assertion doesn't race that
        // re-render (the flake that intermittently failed CI under load).
        expect(
            await within(dialog).findByRole("button", { name: "Delete" }),
        ).toBeDefined();
    });

    it("keeps legacy transfers in the breakdown without adding them to personal cost", async () => {
        const payment = {
            ...expenses[0]!,
            id: "ePay",
            amount: 300,
            actualExpenditure: 300,
            isShared: false,
            isPartnerPayment: true,
        };
        render(
            <ExpenseListInteractive
                expenses={[...expenses, payment]}
                {...{ ...props, movements }}
            />,
        );
        const footer = within(screen.getByTestId("totals-footer"));
        expect(footer.getByText("$1,436.00")).toBeDefined();
        expect(footer.getByText("5 entries")).toBeDefined();
        fireEvent.click(footer.getByRole("button", { name: "Full breakdown" }));
        const dialog = within(await screen.findByRole("dialog"));
        expect(dialog.getAllByText("$1,736.00")).toHaveLength(2);
    });

    it("keeps one accessible breakdown control across responsive layouts", () => {
        render(<ExpenseListInteractive expenses={expenses} {...props} />);
        expect(
            screen.getAllByRole("button", { name: "Full breakdown" }),
        ).toHaveLength(1);
        expect(
            within(screen.getByTestId("totals-footer")).getAllByRole("term"),
        ).toHaveLength(4);
    });

    it("keeps a legacy outside-income transfer out of personal cost", () => {
        render(
            <ExpenseListInteractive
                expenses={expenses}
                {...props}
                movements={[
                    { ...movements[1]!, amount: 8000, fundedFrom: "savings" },
                ]}
            />,
        );
        expect(screen.getByText("Paid Brenda")).toBeDefined();
        const footer = within(screen.getByTestId("totals-footer"));
        expect(footer.getByText("$1,136.00")).toBeDefined();
        expect(footer.queryByText("$8,000.00")).toBeNull();
        expect(
            footer.getByText("Outside income").nextElementSibling?.textContent,
        ).toBe("$0.00");
    });

    it("includes outside-income partner payments in personal cost", () => {
        const payment = {
            ...expenses[0]!,
            id: "payment",
            amount: 530,
            actualExpenditure: 530,
            fundedFrom: "savings" as const,
            isShared: false,
            isPartnerPayment: true,
        };
        render(<ExpenseListInteractive expenses={[payment]} {...props} />);
        const footer = within(screen.getByTestId("totals-footer"));
        expect(
            footer.getByText("My cost").nextElementSibling?.textContent,
        ).toBe("$530.00");
        expect(
            footer.getByText("Outside income").nextElementSibling?.textContent,
        ).toBe("$530.00");
    });

    it("counts the filtered feed and keeps settlement independent of filters", () => {
        const settlement: CoupleBalance = {
            amount: 77,
            balance: 77,
            direction: "she_owes",
            breakdown: [],
        };
        render(
            <ExpenseListInteractive
                expenses={expenses}
                {...props}
                movements={movements}
                settlement={settlement}
            />,
        );
        const footer = within(screen.getByTestId("totals-footer"));
        expect(footer.getByText("4 entries")).toBeDefined();
        expect(footer.getByText("$77.00")).toBeDefined();
        fireEvent.click(screen.getByRole("button", { name: "Food" }));
        expect(footer.getByText("1 entry")).toBeDefined();
        expect(footer.getByText(/May 2026 · Food/)).toBeDefined();
        expect(footer.getByText("$136.00")).toBeDefined();
        expect(footer.getByText("$77.00")).toBeDefined();
    });

    it("shows zero outside-income cost when all expenses use income", () => {
        render(<ExpenseListInteractive expenses={expenses} {...props} />);
        const footer = within(screen.getByTestId("totals-footer"));
        expect(
            footer.getByText("Outside income").nextElementSibling?.textContent,
        ).toBe("$0.00");
    });

    it("hides movements when a category filter is active (they have no category)", () => {
        render(
            <ExpenseListInteractive
                expenses={expenses}
                {...{ ...props, movements }}
            />,
        );
        fireEvent.click(screen.getByRole("button", { name: "Food" }));
        // Movements have no category → gone under a filter.
        expect(screen.queryByText("Card payment")).toBeNull();
        expect(screen.queryByText("Paid Brenda")).toBeNull();
    });

    it("renders edit + delete actions on a movement row", () => {
        render(
            <ExpenseListInteractive
                expenses={expenses}
                {...{ ...props, movements }}
            />,
        );
        expect(
            screen.getByRole("button", { name: "Edit Card payment" }),
        ).toBeDefined();
        expect(
            screen.getByRole("button", { name: "Delete Card payment" }),
        ).toBeDefined();
    });

    it("fetches a card payment then opens its edit dialog", async () => {
        (getMovementForEdit as unknown as Mock).mockResolvedValue({
            id: "mv1",
            date: new Date("2026-05-20T06:00:00Z"),
            amount: 800,
            type: "card_payment",
            cardId: "card1",
            note: null,
            fundedFrom: "income",
        });
        render(
            <ExpenseListInteractive
                expenses={expenses}
                {...{ ...props, movements }}
            />,
        );

        fireEvent.click(
            screen.getByRole("button", { name: "Edit Card payment" }),
        );
        await waitFor(() =>
            expect(getMovementForEdit).toHaveBeenCalledWith("mv1"),
        );
        expect(await screen.findByText(/editing cp mv1/i)).toBeDefined();
    });

    it("opens the transfer edit form for a transfer movement", async () => {
        (getMovementForEdit as unknown as Mock).mockResolvedValue({
            id: "mv2",
            date: new Date("2026-05-18T06:00:00Z"),
            amount: 300,
            type: "gf_paid",
            cardId: null,
            note: "netted",
            fundedFrom: "income",
        });
        render(
            <ExpenseListInteractive
                expenses={expenses}
                {...{ ...props, movements }}
            />,
        );

        fireEvent.click(
            screen.getByRole("button", { name: "Edit Paid Brenda" }),
        );
        await waitFor(() =>
            expect(getMovementForEdit).toHaveBeenCalledWith("mv2"),
        );
        expect(await screen.findByText(/editing tr mv2/i)).toBeDefined();
    });

    it("surfaces an error when the movement fails to load for edit", async () => {
        (getMovementForEdit as unknown as Mock).mockResolvedValue(null);
        render(
            <ExpenseListInteractive
                expenses={expenses}
                {...{ ...props, movements }}
            />,
        );

        fireEvent.click(
            screen.getByRole("button", { name: "Edit Card payment" }),
        );
        expect(
            await screen.findByText(/couldn't load that movement/i),
        ).toBeDefined();
    });

    it("deletes a movement after confirming, then refreshes", async () => {
        (deleteMovement as unknown as Mock).mockResolvedValue({
            ok: true,
            data: { id: "mv2" },
        });
        render(
            <ExpenseListInteractive
                expenses={expenses}
                {...{ ...props, movements }}
            />,
        );

        fireEvent.click(
            screen.getByRole("button", { name: "Delete Paid Brenda" }),
        );
        expect(
            await screen.findByText(/will be permanently removed/i),
        ).toBeDefined();
        fireEvent.click(screen.getByRole("button", { name: "Delete" }));

        await waitFor(() =>
            expect(deleteMovement).toHaveBeenCalledWith({ id: "mv2" }),
        );
        await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    });

    it("never shows a debt she fronted, even when handed one", () => {
        // Settlement-only (spec 0007 §6b). The month query excludes it and `buildFeed`
        // drops it again, so no caller can put the orange row back.
        render(
            <ExpenseListInteractive
                expenses={expenses}
                {...{ ...props, movements: [...movements, debt] }}
            />,
        );
        expect(screen.queryByText("she covered the vet")).toBeNull();
        expect(screen.queryByText(/I owe Brenda/)).toBeNull();
        // Its edit and delete controls go with it — editing a debt is the
        // settlement page's job now.
        expect(
            screen.queryByRole("button", { name: /she covered the vet/ }),
        ).toBeNull();
    });

    it("leaves the totals untouched when a debt is present", () => {
        const { unmount } = render(
            <ExpenseListInteractive expenses={expenses} {...props} />,
        );
        const without = screen.getByTestId("totals-footer").textContent;
        unmount();

        render(
            <ExpenseListInteractive
                expenses={expenses}
                {...{ ...props, movements: [debt] }}
            />,
        );
        // No cash left the account, so no figure may move (ADR-0020).
        expect(screen.getByTestId("totals-footer").textContent).toBe(without);
    });

    describe("funding-source badges (spec 0007 §3.1)", () => {
        const fundedRows = [
            {
                id: "f1",
                date: new Date("2026-05-15T06:00:00Z"),
                description: "Shoes",
                amount: 200,
                actualExpenditure: 200,
                fundedFrom: "savings" as const,
                isShared: false,
                isPartnerPayment: false,
                cycleClosedAt: null,
                category: {
                    id: "c1",
                    slug: "shopping",
                    name: "Shopping",
                    color: "#ef4444",
                },
                subcategory: null,
                card: { name: "Amex", color: "#ca8a04" },
            },
            {
                id: "f2",
                date: new Date("2026-05-12T06:00:00Z"),
                description: "Medicine",
                amount: 800,
                actualExpenditure: 800,
                fundedFrom: "reimbursed" as const,
                isShared: false,
                isPartnerPayment: false,
                cycleClosedAt: null,
                category: {
                    id: "c4",
                    slug: "health",
                    name: "Health",
                    color: "#14b8a6",
                },
                subcategory: null,
                card: { name: "Amex", color: "#ca8a04" },
            },
        ];

        it("badges a savings-funded row and a reimbursed row distinctly", () => {
            render(<ExpenseListInteractive expenses={fundedRows} {...props} />);

            const savingsBadge = screen.getByText("from savings");
            const reimbursedBadge = screen.getByText("reimbursed");
            expect(savingsBadge).toBeDefined();
            expect(reimbursedBadge).toBeDefined();
            // Distinct per value, and reusing existing tokens (no new colours).
            expect(savingsBadge.className).toContain("bg-transfer-tint");
            expect(reimbursedBadge.className).toContain("bg-payment-tint");
        });

        it("shows the row at its full amount — the badge explains, it doesn't discount", () => {
            render(<ExpenseListInteractive expenses={fundedRows} {...props} />);
            const row = screen
                .getByRole("button", { name: "Edit Shoes" })
                .closest("li")!;
            expect(within(row).getByText("Shoes")).toBeDefined();
            expect(within(row).getByText("$200.00")).toBeDefined();
        });

        it("lists the funded rows behind each footer sub-row, following the filter", () => {
            render(<ExpenseListInteractive expenses={fundedRows} {...props} />);
            const footer = within(screen.getByTestId("totals-footer"));
            const reimbursed = footer
                .getByText("Reimbursed")
                .closest("details")!;
            expect(within(reimbursed).getByText("Medicine")).toBeDefined();
            expect(reimbursed.open).toBe(false);

            fireEvent.click(screen.getByRole("button", { name: "Health" }));
            expect(footer.queryByText("From savings")).toBeNull();
            expect(footer.getByText("Reimbursed")).toBeDefined();
        });

        it("gives the title its own full-width line on mobile, badge beneath", () => {
            render(<ExpenseListInteractive expenses={fundedRows} {...props} />);
            const title = screen.getAllByText("Shoes")[0]!;
            // The title line spans every mobile column, so the amount and the
            // actions sit on the next line instead of squeezing it.
            expect(title.parentElement!.className).toContain("col-span-3");
            expect(title.className).toContain("max-sm:basis-full");
            expect(title.className).not.toMatch(/(^| )truncate/);
            expect(
                within(title.parentElement!).getByText("from savings"),
            ).toBeDefined();
        });

        it("leaves an income-funded row unbadged", () => {
            render(<ExpenseListInteractive expenses={expenses} {...props} />);
            expect(screen.queryByText("from savings")).toBeNull();
            expect(screen.queryByText("reimbursed")).toBeNull();
        });
    });

    describe("the list on a phone", () => {
        afterEach(() => vi.unstubAllGlobals());

        const rowList = () =>
            screen.getByRole("button", { name: "Edit Tacos" }).closest("ul")!;

        it("scrolls with the page on mobile, so the top bar can hide and return", () => {
            render(<ExpenseListInteractive expenses={expenses} {...props} />);
            const list = rowList().className.split(" ");
            // Desktop keeps its bounded scroller…
            expect(list).toContain("max-h-[70vh]");
            expect(list).toContain("overflow-y-auto");
            // …mobile drops both, so the window is the only scroller.
            expect(list).toContain("max-sm:max-h-none");
            expect(list).toContain("max-sm:overflow-visible");
        });

        it("keeps the mobile date on one line and truncates the card name instead", () => {
            render(<ExpenseListInteractive expenses={expenses} {...props} />);
            const row = screen
                .getByRole("button", { name: "Edit Tacos" })
                .closest("li")!;

            // The date and its separator sit in one nowrap unit, so they never
            // wrap onto their own line beside a lone "·".
            const dateNode = within(row)
                .getAllByText(/15 may 2026/i)
                .find((el) => el.textContent === "15 may 2026 ·")!;
            expect(dateNode).toBeDefined();
            expect(dateNode.className).toContain("whitespace-nowrap");

            // The card name is the subline's only shrinkable part.
            const cardName = within(row)
                .getAllByText("Amex")
                .find((el) => el.className.includes("truncate"))!;
            expect(cardName).toBeDefined();
            expect(cardName.className).toContain("min-w-0");
        });

        it("keeps the last row clear of the pinned chin, safe area included", () => {
            let update: ResizeObserverCallback | undefined;
            vi.stubGlobal(
                "ResizeObserver",
                class {
                    constructor(callback: ResizeObserverCallback) {
                        update = callback;
                    }
                    observe() {}
                    disconnect() {}
                },
            );
            render(<ExpenseListInteractive expenses={expenses} {...props} />);
            const chin = screen.getByTestId("totals-footer");
            // The chin's box includes its env(safe-area-inset-bottom) padding.
            expect(chin.className).toContain(
                "pb-[env(safe-area-inset-bottom)]",
            );
            vi.spyOn(chin, "getBoundingClientRect").mockReturnValue({
                height: 86,
            } as DOMRect);
            act(() =>
                update?.([{} as ResizeObserverEntry], {} as ResizeObserver),
            );
            // The page ends in a spacer as tall as the chin, right after the rows.
            const spacer = rowList().nextElementSibling as HTMLElement;
            expect(spacer.getAttribute("aria-hidden")).toBe("true");
            expect(spacer.className).toBe("sm:hidden");
            expect(spacer.style.height).toBe("86px");
        });
    });

    describe("the unsettled-balance reminder (CHORE-19)", () => {
        const balance = (
            direction: CoupleBalance["direction"],
            amount: number,
        ): CoupleBalance => ({
            balance: direction === "you_owe" ? -amount : amount,
            amount,
            direction,
            breakdown: [],
        });

        it("says who owes whom, how much, and links to the settlement", () => {
            render(
                <ExpenseListInteractive
                    expenses={expenses}
                    {...props}
                    settlement={balance("you_owe", 1250)}
                />,
            );

            // One responsive footer owns the settlement reminder.
            const links = screen.getAllByRole("link");
            expect(links).toHaveLength(1);
            for (const link of links) {
                expect(link.getAttribute("href")).toBe("/settlement");
                expect(within(link).getByText("You owe Brenda")).toBeDefined();
                expect(within(link).getByText("$1,250.00")).toBeDefined();
            }
        });

        it("reads the other way round when she owes you", () => {
            render(
                <ExpenseListInteractive
                    expenses={expenses}
                    {...props}
                    settlement={balance("she_owes", 430)}
                />,
            );

            const link = screen.getAllByRole("link")[0]!;
            expect(within(link).getByText("Brenda owes you")).toBeDefined();
            expect(within(link).getByText("$430.00")).toBeDefined();
        });

        it("stays calm when nothing is outstanding", () => {
            render(
                <ExpenseListInteractive
                    expenses={expenses}
                    {...props}
                    settlement={balance("settled", 0)}
                />,
            );

            const link = screen.getAllByRole("link")[0]!;
            expect(within(link).getByText("All settled")).toBeDefined();
            expect(within(link).queryByText("$0.00")).toBeNull();
        });

        it("renders nothing in solo mode — there is nobody to settle with", () => {
            render(
                <ExpenseListInteractive
                    expenses={expenses}
                    {...props}
                    sharesExpenses={false}
                    settlement={balance("you_owe", 1250)}
                />,
            );

            expect(screen.queryByRole("link")).toBeNull();
        });

        it("renders nothing when no balance is passed", () => {
            render(<ExpenseListInteractive expenses={expenses} {...props} />);
            expect(screen.queryByRole("link")).toBeNull();
        });

        it("survives an empty month, which has no chin to sit on", () => {
            render(
                <ExpenseListInteractive
                    expenses={[]}
                    {...props}
                    settlement={balance("you_owe", 1250)}
                />,
            );

            expect(
                screen.getByText(/nothing logged for this month/i),
            ).toBeDefined();
            const link = screen.getByRole("link");
            expect(link.getAttribute("href")).toBe("/settlement");
            expect(within(link).getByText("You owe Brenda")).toBeDefined();
        });

        it("names its scope on any month but the live one", () => {
            // Every other figure in this chin is the viewed month, and the month
            // picker sits above it — unqualified, March reads as March's debt.
            render(
                <ExpenseListInteractive
                    expenses={expenses}
                    {...props}
                    monthLabel="March 2026"
                    isCurrentMonth={false}
                    settlement={balance("you_owe", 1250)}
                />,
            );

            expect(
                screen.getAllByText("The open settlement — not March 2026."),
            ).toHaveLength(1);
        });

        it("stays quiet about the scope on the current month", () => {
            render(
                <ExpenseListInteractive
                    expenses={expenses}
                    {...props}
                    settlement={balance("you_owe", 1250)}
                />,
            );

            expect(screen.queryByText(/The open settlement/)).toBeNull();
        });
    });
});
