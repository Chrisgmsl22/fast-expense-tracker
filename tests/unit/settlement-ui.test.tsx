import { describe, it, expect, vi, beforeEach } from "vitest";
import {
    render,
    screen,
    fireEvent,
    waitFor,
    within,
} from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const { getForEditMock, deleteMock } = vi.hoisted(() => ({
    getForEditMock: vi.fn(),
    deleteMock: vi.fn(),
}));
vi.mock("@/app/_actions/expense/get-for-edit", () => ({
    getExpenseForEdit: getForEditMock,
}));
vi.mock("@/app/_actions/expense/delete", () => ({
    deleteExpense: deleteMock,
}));
// PartnerDebtForm (rendered in the edit dialog) imports these; stub them so the
// test doesn't pull the next-auth server graph in for a pure render.
vi.mock("@/app/_actions/movement/add-partner-debt", () => ({
    addPartnerDebt: vi.fn(),
}));
vi.mock("@/app/_actions/movement/update-partner-debt", () => ({
    updatePartnerDebt: vi.fn(),
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
            />,
        );
        expect(screen.getByText("YOU OWE BRENDA")).toBeDefined();
    });

    it("shows the settled state without an amount", () => {
        render(
            <SettlementBalanceCard
                balance={settled}
                carriedOver={{ present: false, amount: 0 }}
            />,
        );
        expect(screen.getByText("All settled")).toBeDefined();
    });

    it("shows the carried-over note when present", () => {
        render(
            <SettlementBalanceCard
                balance={sheOwes}
                carriedOver={{ present: true, amount: 300 }}
            />,
        );
        expect(screen.getByText(/from last month/)).toBeDefined();
        expect(screen.getByText(/\$300\.00 from last month/)).toBeDefined();
    });
});

describe("SettlementChip", () => {
    it("links to /settlement and shows the she-owes label + amount", () => {
        render(<SettlementChip balance={sheOwes} />);
        const link = screen.getByRole("link");
        expect(link.getAttribute("href")).toBe("/settlement");
        expect(screen.getByText("Brenda owes you")).toBeDefined();
        expect(screen.getByText(/\$700\.00/)).toBeDefined();
    });

    it("hides the amount when settled", () => {
        render(<SettlementChip balance={settled} />);
        expect(screen.getByText("All settled")).toBeDefined();
        expect(screen.queryByText(/\$/)).toBeNull();
    });
});

describe("SettlementBreakdown", () => {
    it("renders the four lines and the net", () => {
        render(<SettlementBreakdown balance={sheOwes} />);
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
    const cats = [
        { id: "c1", slug: "groceries", name: "Groceries", color: "#65a30d" },
    ];
    const july = new Date("2026-07-10T06:00:00Z");
    const june = new Date("2026-06-20T06:00:00Z");

    beforeEach(() => {
        getForEditMock.mockReset();
        deleteMock.mockReset();
    });
    const journal: SettlementJournalItem[] = [
        {
            kind: "your_expense",
            id: "e1",
            date: july,
            carriedOver: false,
            description: "Groceries",
            gross: 1000,
            partnerShare: 320,
        },
        {
            kind: "funded_card_payment",
            id: "m1",
            date: july,
            carriedOver: false,
            amount: 320,
        },
        {
            kind: "partner_debt",
            id: "e2",
            date: june,
            carriedOver: true,
            description: "I owe Brenda",
            amount: 300,
        },
    ];

    it("renders rows with the Earlier-months divider before carried rows", () => {
        render(<SettlementJournal journal={journal} categories={cats} />);
        expect(screen.getByText("Groceries")).toBeDefined();
        expect(screen.getByText("+$320.00")).toBeDefined();
        expect(screen.getByText("I owe Brenda")).toBeDefined();
        expect(screen.getByText("−$300.00")).toBeDefined();
        expect(screen.getByText("Earlier months")).toBeDefined();
    });

    it("renders a funded card payment row", () => {
        render(<SettlementJournal journal={journal} categories={cats} />);
        expect(screen.getByText(/Brenda's money → card payment/)).toBeDefined();
    });

    it("shows an empty state when there is nothing to settle", () => {
        render(<SettlementJournal journal={[]} categories={cats} />);
        expect(screen.getByText("Nothing to settle yet.")).toBeDefined();
    });

    it("shows edit + delete only on the debt row", () => {
        render(<SettlementJournal journal={journal} categories={cats} />);
        expect(screen.getByLabelText("Edit I owe Brenda")).toBeDefined();
        expect(screen.getByLabelText("Delete I owe Brenda")).toBeDefined();
        // A shared-expense row is not editable here.
        expect(screen.queryByLabelText("Edit Groceries")).toBeNull();
    });

    it("opens the delete confirm and calls deleteExpense", async () => {
        deleteMock.mockResolvedValue({ ok: true, data: { id: "e2" } });
        render(<SettlementJournal journal={journal} categories={cats} />);
        fireEvent.click(screen.getByLabelText("Delete I owe Brenda"));

        const dialog = await screen.findByRole("dialog");
        expect(within(dialog).getByText("Delete this debt?")).toBeDefined();
        fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
        await waitFor(() =>
            expect(deleteMock).toHaveBeenCalledWith({ id: "e2" }),
        );
    });

    it("loads the debt into an edit form", async () => {
        getForEditMock.mockResolvedValue({
            id: "e2",
            date: june,
            amount: 300,
            categoryId: "c1",
            subcategoryId: null,
            cardId: null,
            description: "I owe Brenda",
            notes: null,
            isShared: false,
            yourPercentage: 1,
            paidBy: "gf",
        });
        render(<SettlementJournal journal={journal} categories={cats} />);
        fireEvent.click(screen.getByLabelText("Edit I owe Brenda"));

        expect(await screen.findByText('Edit "I owe Brenda"')).toBeDefined();
        expect(getForEditMock).toHaveBeenCalledWith("e2");
    });
});
