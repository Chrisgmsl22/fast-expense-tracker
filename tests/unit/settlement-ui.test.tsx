import { describe, it, expect, vi, beforeEach } from "vitest";
import {
    render,
    screen,
    fireEvent,
    waitFor,
    within,
} from "@testing-library/react";

const { refreshMock, getMovementForEditMock, getExpenseForEditMock } =
    vi.hoisted(() => ({
        refreshMock: vi.fn(),
        getMovementForEditMock: vi.fn(),
        getExpenseForEditMock: vi.fn(),
    }));
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: refreshMock }),
}));
vi.mock("@/app/_actions/movement/get-for-edit", () => ({
    getMovementForEdit: getMovementForEditMock,
}));
vi.mock("@/app/_actions/expense/get-for-edit", () => ({
    getExpenseForEdit: getExpenseForEditMock,
}));
// jsdom has no layout, so it ships no `scrollIntoView`.
const scrollIntoViewMock = vi.fn();
Element.prototype.scrollIntoView = scrollIntoViewMock;
const { deleteMock, deleteExpenseMock } = vi.hoisted(() => ({
    deleteMock: vi.fn(),
    deleteExpenseMock: vi.fn(),
}));
vi.mock("@/app/_actions/expense/delete", () => ({
    deleteExpense: deleteExpenseMock,
}));
vi.mock("@/app/_actions/movement/delete", () => ({
    deleteMovement: deleteMock,
}));
// PartnerDebtForm (rendered in the edit dialog) imports these; stub them so the
// test doesn't pull the next-auth server graph in for a pure render.
vi.mock("@/app/_actions/movement/add-partner-debt", () => ({
    addPartnerDebt: vi.fn(),
}));
vi.mock("@/app/_actions/movement/update-partner-debt", () => ({
    updatePartnerDebt: vi.fn(),
}));
vi.mock("@/app/_actions/expense/add-partner-payment", () => ({
    addPartnerPayment: vi.fn(),
}));
vi.mock("@/app/_actions/expense/update-partner-payment", () => ({
    updatePartnerPayment: vi.fn(),
}));
// TransferForm (rendered in the transfer edit dialog) imports these too.
vi.mock("@/app/_actions/movement/add-transfer", () => ({
    addTransfer: vi.fn(),
}));
const { updateTransferMock } = vi.hoisted(() => ({
    updateTransferMock: vi.fn(),
}));
vi.mock("@/app/_actions/movement/update-transfer", () => ({
    updateTransfer: updateTransferMock,
}));

import { SettlementBalanceCard } from "@/components/settlement/SettlementBalanceCard";
import { SettlementBreakdown } from "@/components/settlement/SettlementBreakdown";
import { SettlementJournal } from "@/components/settlement/SettlementJournal";
import { SettlementChip } from "@/components/dashboard/SettlementChip";
import { updatePartnerPayment } from "@/app/_actions/expense/update-partner-payment";
import { updatePartnerDebt } from "@/app/_actions/movement/update-partner-debt";
import { FUNDING_TOGGLE_LABEL } from "@/lib/domain/funding";
import { computeCoupleBalance } from "@/lib/domain/settlement";
import type { MovementEditable } from "@/lib/repositories/movement.repository";
import type { SettlementJournalItem } from "@/lib/services/settlement/settlement.service";

const sheOwes = computeCoupleBalance({
    partnerShareOfYourExpenses: 700,
    yourDebtToPartner: 0,
    moneyPartnerPaidYou: 0,
    moneyYouPaidPartner: 0,
});
const youOwe = computeCoupleBalance({
    partnerShareOfYourExpenses: 0,
    yourDebtToPartner: 200,
    moneyPartnerPaidYou: 0,
    moneyYouPaidPartner: 0,
});
const settled = computeCoupleBalance({
    partnerShareOfYourExpenses: 0,
    yourDebtToPartner: 0,
    moneyPartnerPaidYou: 0,
    moneyYouPaidPartner: 0,
});

describe("SettlementBalanceCard", () => {
    it("shows the she-owes state with the amount", () => {
        render(
            <SettlementBalanceCard
                balance={sheOwes}
                carriedOver={{ present: false, amount: 0 }}
                partnerName="Brenda"
            />,
        );
        expect(screen.getByText("BRENDA OWES YOU")).toBeDefined();
        expect(screen.getByText(/\$700\.00/)).toBeDefined();
    });

    it("shows the you-owe state", () => {
        render(
            <SettlementBalanceCard
                balance={youOwe}
                carriedOver={{ present: false, amount: 0 }}
                partnerName="Brenda"
            />,
        );
        expect(screen.getByText("YOU OWE BRENDA")).toBeDefined();
    });

    it("shows the settled state without an amount", () => {
        render(
            <SettlementBalanceCard
                balance={settled}
                carriedOver={{ present: false, amount: 0 }}
                partnerName="Brenda"
            />,
        );
        expect(screen.getByText("All settled")).toBeDefined();
    });

    it("shows the carried-over note when present", () => {
        render(
            <SettlementBalanceCard
                balance={sheOwes}
                carriedOver={{ present: true, amount: 300 }}
                partnerName="Brenda"
            />,
        );
        expect(screen.getByText(/from last month/)).toBeDefined();
        expect(screen.getByText(/\$300\.00 from last month/)).toBeDefined();
    });
});

describe("SettlementChip", () => {
    it("links to /settlement and shows the she-owes label + amount", () => {
        render(<SettlementChip balance={sheOwes} partnerName="Brenda" />);
        const link = screen.getByRole("link");
        expect(link.getAttribute("href")).toBe("/settlement");
        expect(screen.getByText("Brenda owes you")).toBeDefined();
        expect(screen.getByText(/\$700\.00/)).toBeDefined();
    });

    it("hides the amount when settled", () => {
        render(<SettlementChip balance={settled} partnerName="Brenda" />);
        expect(screen.getByText("All settled")).toBeDefined();
        expect(screen.queryByText(/\$/)).toBeNull();
    });
});

describe("SettlementBreakdown", () => {
    it("renders the five lines and the net", () => {
        render(
            <SettlementBreakdown
                balance={sheOwes}
                breakdownItems={{
                    partner_debt: [],
                    partner_share: [
                        {
                            id: "e1",
                            date: new Date("2026-07-10T06:00:00Z"),
                            description: "Groceries",
                            amount: 700,
                            gross: 2187.5,
                        },
                    ],
                    your_debt: [],
                    partner_paid: [],
                    you_paid: [],
                }}
                partnerName="Brenda"
            />,
        );
        expect(
            screen.getByText(/32% of shared expenses you logged/),
        ).toBeDefined();
        expect(
            screen.getByText(/Debts you logged as "I owe Brenda"/),
        ).toBeDefined();
        expect(
            screen.getByText(/Debts you logged as "Brenda owes me"/),
        ).toBeDefined();
        expect(screen.getByText(/Money Brenda paid you/)).toBeDefined();
        expect(screen.getByText(/Money you paid Brenda/)).toBeDefined();
        expect(screen.getByText("Brenda owes you $700.00")).toBeDefined();
    });
});

/** What `getMovementForEdit` returns for an open movement. */
function editable(
    over: Partial<MovementEditable> & Pick<MovementEditable, "id" | "type">,
): { ok: true; data: MovementEditable } {
    return {
        ok: true,
        data: {
            date: new Date("2026-09-10T06:00:00Z"),
            amount: 100,
            cardId: null,
            note: null,
            fundedFrom: "income",
            closedAt: null,
            cycleClosedAt: null,
            ...over,
        },
    };
}

beforeEach(() => {
    refreshMock.mockReset();
    getMovementForEditMock.mockReset();
    getExpenseForEditMock.mockReset();
    scrollIntoViewMock.mockReset();
});

describe("SettlementJournal", () => {
    it("shows a partner debt as positive and preserves its direction through edit", async () => {
        vi.mocked(updatePartnerDebt).mockResolvedValue({
            ok: true,
            data: { id: "partner-debt" },
        });
        getMovementForEditMock.mockResolvedValue(
            editable({ id: "partner-debt", type: "partner_debt" }),
        );
        render(
            <SettlementJournal
                partnerName="Alex"
                journal={[
                    {
                        id: "partner-debt",
                        kind: "partner_debt",
                        direction: "partner_debt",
                        date: new Date("2026-09-10T06:00:00Z"),
                        carriedOver: false,
                        locked: false,
                        description: "Alex owes me",
                        amount: 100,
                        source: "movement",
                    },
                ]}
            />,
        );
        expect(screen.getByText("+$100.00").className).toContain(
            "text-positive",
        );
        expect(screen.queryByText(/I owe Alex/)).toBeNull();
        fireEvent.click(screen.getByLabelText("Edit Alex owes me"));
        const dialog = await screen.findByRole("dialog");
        expect(within(dialog).getByText('Edit "Alex owes me"')).toBeDefined();
        expect(
            (within(dialog).getByLabelText(/Note/) as HTMLInputElement).value,
        ).toBe("");
        fireEvent.change(
            within(dialog).getByLabelText("What Alex owes you (MXN)"),
            { target: { value: "120" } },
        );
        fireEvent.click(
            within(dialog).getByRole("button", { name: "Save changes" }),
        );
        await waitFor(() =>
            expect(updatePartnerDebt).toHaveBeenCalledWith({
                id: "partner-debt",
                direction: "partner_debt",
                date: "2026-09-10",
                amount: "120",
                note: undefined,
            }),
        );
    });

    const july = new Date("2026-07-10T06:00:00Z");
    const june = new Date("2026-06-20T06:00:00Z");

    beforeEach(() => {
        deleteMock.mockReset();
        updateTransferMock.mockReset();
        updateTransferMock.mockResolvedValue({ ok: true, data: { id: "m1" } });
    });
    const journal: SettlementJournalItem[] = [
        {
            kind: "your_expense",
            id: "e1",
            date: july,
            carriedOver: false,
            locked: false,
            description: "Groceries",
            gross: 1000,
            partnerShare: 320,
        },
        {
            kind: "transfer",
            id: "m1",
            date: july,
            carriedOver: false,
            locked: false,
            direction: "gf_received",
            amount: 320,
            fundedFrom: "income",
            note: "rent",
            source: "movement",
        },
        {
            kind: "partner_debt",
            direction: "gf_fronted",
            id: "e2",
            date: june,
            carriedOver: true,
            locked: false,
            description: "I owe Brenda",
            amount: 300,
            // A debt is a movement again (spec 0007 §6b).
            source: "movement",
        },
    ];

    it("renders rows with the Earlier-months divider before carried rows", () => {
        render(<SettlementJournal journal={journal} partnerName="Brenda" />);
        expect(screen.getByText("Groceries")).toBeDefined();
        expect(screen.getByText("+$320.00")).toBeDefined();
        expect(screen.getByText("I owe Brenda")).toBeDefined();
        expect(screen.getByText("−$300.00")).toBeDefined();
        expect(screen.getByText("Earlier months")).toBeDefined();
    });

    it("renders a transfer row with its note in the subtitle", () => {
        render(<SettlementJournal journal={journal} partnerName="Brenda" />);
        expect(screen.getByText(/Transfer — Brenda paid you/)).toBeDefined();
        expect(screen.getByText(/rent/)).toBeDefined();
    });

    it("shows an empty state when there is nothing to settle", () => {
        render(<SettlementJournal journal={[]} partnerName="Brenda" />);
        expect(screen.getByText("Nothing to settle yet.")).toBeDefined();
    });

    describe("the funding badge on a transfer", () => {
        const transferRow = (
            fundedFrom: "income" | "savings",
            direction: "gf_paid" | "gf_received" = "gf_paid",
        ): SettlementJournalItem[] => [
            {
                kind: "transfer",
                id: "m2",
                date: july,
                carriedOver: false,
                locked: false,
                direction,
                amount: 700,
                fundedFrom,
                note: null,
                // A LEGACY transfer: the badge case that still lives on a movement.
                source: "movement",
            },
        ];

        it("badges a savings-funded payment, which still counts in the balance", () => {
            render(
                <SettlementJournal
                    journal={transferRow("savings")}
                    partnerName="Brenda"
                />,
            );
            expect(screen.getByText("from savings")).toBeDefined();
            // The amount is unreduced: this page is the settlement ledger, and
            // savings money reached her all the same (spec 0007 §6a).
            expect(screen.getByText("$700.00")).toBeDefined();
        });

        it("leaves an income-funded payment unbadged", () => {
            render(
                <SettlementJournal
                    journal={transferRow("income")}
                    partnerName="Brenda"
                />,
            );
            expect(screen.queryByText("from savings")).toBeNull();
        });

        it("never badges money she sent you — her funding isn't yours", () => {
            render(
                <SettlementJournal
                    journal={transferRow("savings", "gf_received")}
                    partnerName="Brenda"
                />,
            );
            expect(
                screen.getByText(/Transfer — Brenda paid you/),
            ).toBeDefined();
            expect(screen.queryByText("from savings")).toBeNull();
        });
    });

    it("shows edit + delete on the debt and transfer rows, not a shared expense", () => {
        render(<SettlementJournal journal={journal} partnerName="Brenda" />);
        expect(screen.getByLabelText("Edit I owe Brenda")).toBeDefined();
        expect(screen.getByLabelText("Delete I owe Brenda")).toBeDefined();
        expect(
            screen.getByLabelText("Edit Transfer — Brenda paid you"),
        ).toBeDefined();
        expect(
            screen.getByLabelText("Delete Transfer — Brenda paid you"),
        ).toBeDefined();
        // A shared-expense row is not editable here (edited on the expenses screen).
        expect(screen.queryByLabelText("Edit Groceries")).toBeNull();
    });

    // A DEBT is a movement again (spec 0007 §6b), so it deletes through the
    // movement action. Routing is by the row's own `source`, never by its kind.
    it("opens the delete confirm and deletes the debt as a movement", async () => {
        deleteMock.mockResolvedValue({ ok: true, data: { id: "e2" } });
        render(<SettlementJournal journal={journal} partnerName="Brenda" />);
        fireEvent.click(screen.getByLabelText("Delete I owe Brenda"));

        const dialog = await screen.findByRole("dialog");
        expect(within(dialog).getByText("Delete this debt?")).toBeDefined();
        fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
        await waitFor(() =>
            expect(deleteMock).toHaveBeenCalledWith({ id: "e2" }),
        );
        expect(deleteExpenseMock).not.toHaveBeenCalled();
    });

    // Nothing in the rendered row says which table it came from, so `source` is the only
    // thing that can send the delete to the movement action.
    it("deletes a movement-backed debt through the movement action", async () => {
        deleteMock.mockResolvedValue({ ok: true, data: { id: "debt1" } });
        const debtRow: SettlementJournalItem = {
            kind: "partner_debt",
            direction: "gf_fronted",
            id: "debt1",
            date: june,
            carriedOver: true,
            locked: false,
            description: "I owe Brenda",
            amount: 150,
            source: "movement",
        };
        render(<SettlementJournal journal={[debtRow]} partnerName="Brenda" />);
        fireEvent.click(screen.getByLabelText("Delete I owe Brenda"));

        const dialog = await screen.findByRole("dialog");
        fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
        await waitFor(() =>
            expect(deleteMock).toHaveBeenCalledWith({ id: "debt1" }),
        );
        // Sending it to the expense table would report "not found" for a row
        // sitting in plain sight.
        expect(deleteExpenseMock).not.toHaveBeenCalledWith({ id: "debt1" });
    });

    it("offers edit AND delete on a movement-backed debt", () => {
        const debtRow: SettlementJournalItem = {
            kind: "partner_debt",
            direction: "gf_fronted",
            id: "debt1",
            date: june,
            carriedOver: true,
            locked: false,
            description: "I owe Brenda",
            amount: 150,
            source: "movement",
        };
        render(<SettlementJournal journal={[debtRow]} partnerName="Brenda" />);

        // A debt is a movement by design now (spec 0007 §6b) and `PartnerDebtForm` writes
        // `updatePartnerDebt`, so it is editable.
        expect(screen.getByLabelText("Edit I owe Brenda")).toBeDefined();
        expect(screen.getByLabelText("Delete I owe Brenda")).toBeDefined();
        expect(screen.queryByText(/delete to change/)).toBeNull();
    });

    it("loads the debt into an edit form, prefilled from the server read", async () => {
        getMovementForEditMock.mockResolvedValue(
            editable({ id: "e2", type: "gf_fronted", amount: 300 }),
        );
        render(<SettlementJournal journal={journal} partnerName="Brenda" />);
        fireEvent.click(screen.getByLabelText("Edit I owe Brenda"));

        const dialog = await screen.findByRole("dialog");
        expect(getMovementForEditMock).toHaveBeenCalledWith("e2");
        expect(within(dialog).getByText('Edit "I owe Brenda"')).toBeDefined();
        expect(
            (within(dialog).getByLabelText(/What you owe/) as HTMLInputElement)
                .value,
        ).toBe("300");
    });

    describe("a stale tab opening a row a closed cycle froze", () => {
        const debtRefused = {
            ok: false,
            code: "cycle_closed",
            message:
                "This debt counts in a settlement you already closed, so it can't be edited.",
        };

        it.each([
            ["the debt", "Edit I owe Brenda", "e2", debtRefused],
            [
                "the transfer",
                "Edit Transfer — Brenda paid you",
                "m1",
                {
                    ok: false,
                    code: "cycle_closed",
                    message:
                        "This transfer counts in a settlement you already closed, so it can't be edited.",
                },
            ],
        ])(
            "shows the refusal for %s, refreshes, and opens no dialog",
            async (_label, editName, id, refusal) => {
                getMovementForEditMock.mockResolvedValue(refusal);
                render(
                    <SettlementJournal
                        journal={journal}
                        partnerName="Brenda"
                    />,
                );

                fireEvent.click(screen.getByLabelText(editName));

                const alert = await screen.findByRole("alert");
                expect(getMovementForEditMock).toHaveBeenCalledWith(id);
                expect(alert.textContent).toBe(refusal.message);
                expect(screen.queryByRole("dialog")).toBeNull();
                await waitFor(() => expect(document.activeElement).toBe(alert));
                expect(scrollIntoViewMock).toHaveBeenCalledWith({
                    block: "center",
                });
                expect(scrollIntoViewMock.mock.contexts[0]).toBe(alert);
                expect(refreshMock).toHaveBeenCalledTimes(1);
            },
        );

        it("does not refresh on a refusal that is not about the cycle", async () => {
            getMovementForEditMock.mockResolvedValue({
                ok: false,
                code: "not_found",
                message: "Couldn't load that movement. Please refresh.",
            });
            render(
                <SettlementJournal journal={journal} partnerName="Brenda" />,
            );

            fireEvent.click(screen.getByLabelText("Edit I owe Brenda"));

            expect((await screen.findByRole("alert")).textContent).toMatch(
                /couldn't load that movement/i,
            );
            expect(screen.queryByRole("dialog")).toBeNull();
            expect(refreshMock).not.toHaveBeenCalled();
        });

        it("disables the confirm and focuses the reason when a delete is refused", async () => {
            deleteMock.mockResolvedValue({
                ok: false,
                code: "cycle_closed",
                message:
                    "This row counts in a settlement you already closed, so it can't be deleted.",
            });
            render(
                <SettlementJournal journal={journal} partnerName="Brenda" />,
            );
            fireEvent.click(screen.getByLabelText("Delete I owe Brenda"));
            const dialog = await screen.findByRole("dialog");
            fireEvent.click(
                within(dialog).getByRole("button", { name: "Delete" }),
            );

            const alert = await within(dialog).findByRole("alert");
            expect(alert.textContent).toMatch(/settlement you already closed/);
            expect(refreshMock).toHaveBeenCalledTimes(1);
            await waitFor(() =>
                expect(
                    (
                        within(dialog).getByRole("button", {
                            name: "Delete",
                        }) as HTMLButtonElement
                    ).disabled,
                ).toBe(true),
            );
            await waitFor(() => expect(document.activeElement).toBe(alert));

            // Cancel clears it, so the next confirm starts clean and enabled.
            fireEvent.click(
                within(dialog).getByRole("button", { name: "Cancel" }),
            );
            await waitFor(() =>
                expect(screen.queryByRole("dialog")).toBeNull(),
            );
            expect(screen.queryByRole("alert")).toBeNull();
            fireEvent.click(
                screen.getByLabelText("Delete Transfer — Brenda paid you"),
            );
            const next = await screen.findByRole("dialog");
            expect(within(next).queryByRole("alert")).toBeNull();
            expect(
                (
                    within(next).getByRole("button", {
                        name: "Delete",
                    }) as HTMLButtonElement
                ).disabled,
            ).toBe(false);
        });

        it("opens the delete dialog clean after an edit refusal", async () => {
            getMovementForEditMock.mockResolvedValue(debtRefused);
            render(
                <SettlementJournal journal={journal} partnerName="Brenda" />,
            );
            fireEvent.click(screen.getByLabelText("Edit I owe Brenda"));
            await screen.findByRole("alert");

            const remove = screen.getByLabelText(
                "Delete Transfer — Brenda paid you",
            ) as HTMLButtonElement;
            await waitFor(() => expect(remove.disabled).toBe(false));
            fireEvent.click(remove);
            const dialog = await screen.findByRole("dialog");
            expect(within(dialog).queryByRole("alert")).toBeNull();
        });

        // On "Open settlement" the refresh drops the just-closed rows, so the list
        // empties under the refusal. Simulated by re-rendering with no rows.
        describe("when the refresh empties the list", () => {
            const EMPTY =
                "This settlement is empty — nothing has been logged since the last close.";
            const openJournal = (rows: SettlementJournalItem[]) => (
                <SettlementJournal
                    bare
                    journal={rows}
                    partnerName="Brenda"
                    emptyMessage={EMPTY}
                />
            );

            it("keeps the edit refusal on screen and focused", async () => {
                getMovementForEditMock.mockResolvedValue(debtRefused);
                const { rerender } = render(openJournal(journal));
                fireEvent.click(screen.getByLabelText("Edit I owe Brenda"));
                const alert = await screen.findByRole("alert");
                await waitFor(() => expect(document.activeElement).toBe(alert));

                rerender(openJournal([]));

                expect(screen.getByText(EMPTY)).toBeDefined();
                const still = screen.getByRole("alert");
                expect(still.textContent).toBe(debtRefused.message);
                expect(document.activeElement).toBe(still);
            });

            it("keeps the refused delete dialog open, its reason focused and Delete disabled", async () => {
                deleteMock.mockResolvedValue({
                    ok: false,
                    code: "cycle_closed",
                    message:
                        "This row counts in a settlement you already closed, so it can't be deleted.",
                });
                const { rerender } = render(openJournal(journal));
                fireEvent.click(screen.getByLabelText("Delete I owe Brenda"));
                const dialog = await screen.findByRole("dialog");
                fireEvent.click(
                    within(dialog).getByRole("button", { name: "Delete" }),
                );
                const alert = await within(dialog).findByRole("alert");
                await waitFor(() => expect(document.activeElement).toBe(alert));

                rerender(openJournal([]));

                const still = screen.getByRole("dialog");
                const reason = within(still).getByRole("alert");
                expect(reason.textContent).toMatch(/already closed/);
                expect(document.activeElement).toBe(reason);
                expect(
                    (
                        within(still).getByRole("button", {
                            name: "Delete",
                        }) as HTMLButtonElement
                    ).disabled,
                ).toBe(true);

                fireEvent.click(
                    within(still).getByRole("button", { name: "Cancel" }),
                );
                await waitFor(() =>
                    expect(screen.queryByRole("dialog")).toBeNull(),
                );
                expect(screen.queryByRole("alert")).toBeNull();
            });
        });

        it("treats a debt edit that reads back a non-debt row as not found", async () => {
            getMovementForEditMock.mockResolvedValue(
                editable({ id: "e2", type: "gf_paid", amount: 300 }),
            );
            render(
                <SettlementJournal journal={journal} partnerName="Brenda" />,
            );
            fireEvent.click(screen.getByLabelText("Edit I owe Brenda"));

            expect((await screen.findByRole("alert")).textContent).toBe(
                "Couldn't load that debt. Please refresh.",
            );
            expect(screen.queryByRole("dialog")).toBeNull();
            expect(refreshMock).not.toHaveBeenCalled();
        });
    });

    it("edits a transfer, prefilled from the server read, and saves via updateTransfer", async () => {
        getMovementForEditMock.mockResolvedValue(
            editable({
                id: "m1",
                type: "gf_received",
                amount: 320,
                note: "rent",
            }),
        );
        render(<SettlementJournal journal={journal} partnerName="Brenda" />);
        fireEvent.click(
            screen.getByLabelText("Edit Transfer — Brenda paid you"),
        );

        const dialog = await screen.findByRole("dialog");
        expect(within(dialog).getByText("Edit transfer")).toBeDefined();
        // Amount + note prefilled straight from the row.
        expect(
            (within(dialog).getByLabelText(/Amount/) as HTMLInputElement).value,
        ).toBe("320");
        expect(
            (within(dialog).getByLabelText(/Note/) as HTMLInputElement).value,
        ).toBe("rent");

        fireEvent.click(
            within(dialog).getByRole("button", { name: /Save changes/ }),
        );
        await waitFor(() =>
            expect(updateTransferMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: "m1",
                    direction: "gf_received",
                    amount: "320",
                }),
            ),
        );
    });

    it("deletes a transfer via deleteMovement", async () => {
        deleteMock.mockResolvedValue({ ok: true, data: { id: "m1" } });
        render(<SettlementJournal journal={journal} partnerName="Brenda" />);
        fireEvent.click(
            screen.getByLabelText("Delete Transfer — Brenda paid you"),
        );

        const dialog = await screen.findByRole("dialog");
        expect(within(dialog).getByText("Delete this transfer?")).toBeDefined();
        fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
        await waitFor(() =>
            expect(deleteMock).toHaveBeenCalledWith({ id: "m1" }),
        );
    });
});

describe("SettlementJournal — a payment is an expense (spec 0007 §6b)", () => {
    const payment: SettlementJournalItem = {
        kind: "transfer",
        id: "ePay",
        date: new Date("2026-07-11T06:00:00Z"),
        carriedOver: false,
        locked: false,
        direction: "gf_paid",
        amount: 150,
        note: null,
        fundedFrom: "income",
        source: "expense",
    };

    beforeEach(() => {
        deleteMock.mockReset();
        deleteExpenseMock.mockReset();
    });

    it("deletes a payment through the EXPENSE action, not the movement one", async () => {
        // The reported defect: the dialog closed, no error appeared, and the $150 row
        // survived — `deleteMovement` answered as though it worked.
        deleteExpenseMock.mockResolvedValue({ ok: true, data: { id: "ePay" } });
        render(<SettlementJournal journal={[payment]} partnerName="Brenda" />);
        fireEvent.click(
            screen.getByLabelText("Delete Transfer — you paid Brenda"),
        );

        const dialog = await screen.findByRole("dialog");
        fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

        await waitFor(() =>
            expect(deleteExpenseMock).toHaveBeenCalledWith({ id: "ePay" }),
        );
        expect(deleteMock).not.toHaveBeenCalled();
    });

    it("surfaces a failed delete instead of closing quietly", async () => {
        deleteExpenseMock.mockResolvedValue({
            ok: false,
            code: "not_found",
            message: "Expense not found.",
        });
        render(<SettlementJournal journal={[payment]} partnerName="Brenda" />);
        fireEvent.click(
            screen.getByLabelText("Delete Transfer — you paid Brenda"),
        );
        const dialog = await screen.findByRole("dialog");
        fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

        expect(await screen.findByRole("alert")).toHaveProperty(
            "textContent",
            "Expense not found.",
        );
    });

    describe("editing a payment opens through the expense read", () => {
        const openPaymentEdit = () => {
            render(
                <SettlementJournal journal={[payment]} partnerName="Brenda" />,
            );
            fireEvent.click(
                screen.getByLabelText("Edit Transfer — you paid Brenda"),
            );
        };

        const paymentEditable = (description: string) => ({
            ok: true,
            data: {
                id: "ePay",
                date: new Date("2026-07-12T06:00:00Z"),
                amount: 175,
                actualExpenditure: 175,
                categoryId: "cat1",
                subcategoryId: null,
                cardId: null,
                description,
                notes: null,
                isShared: false,
                yourPercentage: 1,
                paidBy: "you",
                fundedFrom: "savings",
                isPartnerPayment: true,
                cycleClosedAt: null,
            },
        });

        it("prefills from the server's row, savings source included, and saves it back", async () => {
            vi.mocked(updatePartnerPayment).mockResolvedValue({
                ok: true,
                data: { id: "ePay" },
            });
            getExpenseForEditMock.mockResolvedValue(
                paymentEditable("rent share"),
            );
            openPaymentEdit();

            const dialog = await screen.findByRole("dialog");
            expect(getExpenseForEditMock).toHaveBeenCalledWith("ePay");
            expect(getMovementForEditMock).not.toHaveBeenCalled();
            expect(
                (within(dialog).getByLabelText(/Amount/) as HTMLInputElement)
                    .value,
            ).toBe("175");
            expect(
                (within(dialog).getByLabelText(/Note/) as HTMLInputElement)
                    .value,
            ).toBe("rent share");
            // Dropping the source here would re-file a savings payment as income on save.
            expect(
                within(dialog)
                    .getByRole("checkbox", {
                        name: FUNDING_TOGGLE_LABEL.savings,
                    })
                    .getAttribute("aria-checked"),
            ).toBe("true");

            fireEvent.click(
                within(dialog).getByRole("button", { name: /Save changes/ }),
            );
            await waitFor(() =>
                expect(updatePartnerPayment).toHaveBeenCalledWith(
                    expect.objectContaining({
                        id: "ePay",
                        amount: "175",
                        fundedFrom: "savings",
                    }),
                ),
            );
        });

        it("leaves the note empty when the description is the auto-label", async () => {
            getExpenseForEditMock.mockResolvedValue(
                paymentEditable("Transfer — you paid Brenda"),
            );
            openPaymentEdit();

            const dialog = await screen.findByRole("dialog");
            expect(
                (within(dialog).getByLabelText(/Note/) as HTMLInputElement)
                    .value,
            ).toBe("");
        });

        it("shows a closed-cycle refusal in view, refreshes, and opens no dialog", async () => {
            const message =
                "This payment counts in a settlement you already closed, so it can't be edited.";
            getExpenseForEditMock.mockResolvedValue({
                ok: false,
                code: "cycle_closed",
                message,
            });
            openPaymentEdit();

            const alert = await screen.findByRole("alert");
            expect(alert.textContent).toBe(message);
            expect(screen.queryByRole("dialog")).toBeNull();
            await waitFor(() => expect(document.activeElement).toBe(alert));
            expect(scrollIntoViewMock.mock.contexts[0]).toBe(alert);
            expect(refreshMock).toHaveBeenCalledTimes(1);
        });

        it("does not refresh when the payment is simply not found", async () => {
            getExpenseForEditMock.mockResolvedValue({
                ok: false,
                code: "not_found",
                message: "Couldn't load that expense. Please refresh.",
            });
            openPaymentEdit();

            expect((await screen.findByRole("alert")).textContent).toMatch(
                /couldn't load that expense/i,
            );
            expect(screen.queryByRole("dialog")).toBeNull();
            expect(refreshMock).not.toHaveBeenCalled();
        });
    });

    it("still routes money SHE sent through the movement action", async () => {
        deleteMock.mockResolvedValue({ ok: true, data: { id: "mIn" } });
        const received: SettlementJournalItem = {
            ...payment,
            id: "mIn",
            direction: "gf_received",
            source: "movement",
        };
        render(<SettlementJournal journal={[received]} partnerName="Brenda" />);
        fireEvent.click(
            screen.getByLabelText("Delete Transfer — Brenda paid you"),
        );
        const dialog = await screen.findByRole("dialog");
        fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

        await waitFor(() =>
            expect(deleteMock).toHaveBeenCalledWith({ id: "mIn" }),
        );
        expect(deleteExpenseMock).not.toHaveBeenCalled();
    });
});
