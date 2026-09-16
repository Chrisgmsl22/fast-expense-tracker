import { describe, it, expect, vi, beforeEach } from "vitest";
import {
    render,
    screen,
    fireEvent,
    waitFor,
    within,
} from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
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
import { computeCoupleBalance } from "@/lib/domain/settlement";
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
    it("renders the four lines and the net", () => {
        render(
            <SettlementBreakdown
                balance={sheOwes}
                breakdownItems={{
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
        expect(screen.getByText(/Debts you logged/)).toBeDefined();
        expect(screen.getByText(/Money Brenda paid you/)).toBeDefined();
        expect(screen.getByText(/Money you paid Brenda/)).toBeDefined();
        expect(screen.getByText("Brenda owes you $700.00")).toBeDefined();
    });
});

describe("SettlementJournal", () => {
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
            note: "rent",
            source: "movement",
        },
        {
            kind: "partner_debt",
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

    // I-1: a debt is a `gf_fronted` MOVEMENT and stays one (spec 0007 §6b), so
    // its journal row carries `source: "movement"`. Nothing in the rendered row
    // says which table it came from, so `source` is the only thing that can send
    // the delete to the movement action instead of the expense one.
    it("deletes a movement-backed debt through the movement action", async () => {
        deleteMock.mockResolvedValue({ ok: true, data: { id: "debt1" } });
        const debtRow: SettlementJournalItem = {
            kind: "partner_debt",
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
            id: "debt1",
            date: june,
            carriedOver: true,
            locked: false,
            description: "I owe Brenda",
            amount: 150,
            source: "movement",
        };
        render(<SettlementJournal journal={[debtRow]} partnerName="Brenda" />);

        // A debt is a movement by design now (spec 0007 §6b) and
        // `PartnerDebtForm` writes `updatePartnerDebt`, so it is editable. The
        // old gate had this backwards and left EVERY debt uneditable, with a
        // "delete to change" subtitle that was simply untrue.
        expect(screen.getByLabelText("Edit I owe Brenda")).toBeDefined();
        expect(screen.getByLabelText("Delete I owe Brenda")).toBeDefined();
        expect(screen.queryByText(/delete to change/)).toBeNull();
    });

    it("loads the debt into an edit form, prefilled from the row", async () => {
        render(<SettlementJournal journal={journal} partnerName="Brenda" />);
        fireEvent.click(screen.getByLabelText("Edit I owe Brenda"));

        const dialog = await screen.findByRole("dialog");
        expect(within(dialog).getByText('Edit "I owe Brenda"')).toBeDefined();
        // Prefilled straight from the journal row — no server round-trip.
        expect(
            (within(dialog).getByLabelText(/What you owe/) as HTMLInputElement)
                .value,
        ).toBe("300");
    });

    it("edits a transfer, prefilled from the row, and saves via updateTransfer", async () => {
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
        source: "expense",
    };

    beforeEach(() => {
        deleteMock.mockReset();
        deleteExpenseMock.mockReset();
    });

    it("deletes a payment through the EXPENSE action, not the movement one", async () => {
        // The reported defect: the dialog closed, no error appeared, and the
        // $150 row survived — `deleteMovement` matched nothing (or matched the
        // leftover movement of the same id) and answered as though it worked.
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
