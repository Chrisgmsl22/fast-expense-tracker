import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

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
    const july = new Date("2026-07-10T06:00:00Z");
    const june = new Date("2026-06-20T06:00:00Z");
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
        render(<SettlementJournal journal={journal} />);
        expect(screen.getByText("Groceries")).toBeDefined();
        expect(screen.getByText("+$320.00")).toBeDefined();
        expect(screen.getByText("I owe Brenda")).toBeDefined();
        expect(screen.getByText("−$300.00")).toBeDefined();
        expect(screen.getByText("Earlier months")).toBeDefined();
    });

    it("renders a funded card payment row", () => {
        render(<SettlementJournal journal={journal} />);
        expect(screen.getByText(/Brenda's money → card payment/)).toBeDefined();
    });

    it("shows an empty state when there is nothing to settle", () => {
        render(<SettlementJournal journal={[]} />);
        expect(screen.getByText("Nothing to settle yet.")).toBeDefined();
    });
});
