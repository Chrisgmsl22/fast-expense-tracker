import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { StatStrip } from "@/components/dashboard/StatStrip";
import { funded } from "@/tests/support/funding-rows";

const stats = {
    income: 48200,
    spent: 42300,
    net: 5900,
    dailyAvg: 1762,
    daysLeft: 7,
};

const groceries = funded({
    id: "g1",
    amount: 1000,
    actualExpenditure: 680,
    isPartnerPayment: false,
    category: { slug: "groceries" },
    fundedFrom: "income",
});

describe("StatStrip", () => {
    it("renders income, spent, net, and daily-average with days left", () => {
        render(<StatStrip {...stats} expenses={[groceries]} />);
        expect(screen.getByText("Income in")).toBeDefined();
        expect(screen.getByText("$48,200.00")).toBeDefined();
        expect(screen.getByText("Spent (my share)")).toBeDefined();
        expect(screen.getByText("Daily avg · 7 left")).toBeDefined();
    });

    it("shows a positive net with a + sign", () => {
        render(<StatStrip {...stats} expenses={[]} />);
        expect(screen.getByText("+$5,900.00")).toBeDefined();
    });

    it("shows a negative net with a minus sign", () => {
        render(
            <StatStrip
                {...stats}
                income={40000}
                spent={45000}
                net={-5000}
                daysLeft={0}
                expenses={[]}
            />,
        );
        expect(screen.getByText("−$5,000.00")).toBeDefined();
    });

    it("splits spend this month's income didn't fund (spec 0007 §3.1)", () => {
        render(
            <StatStrip
                {...stats}
                expenses={[
                    groceries,
                    funded({
                        id: "s1",
                        amount: 1800,
                        actualExpenditure: 1800,
                        isPartnerPayment: false,
                        category: { slug: "shopping" },
                        fundedFrom: "savings",
                        description: "Desk chair",
                    }),
                    funded({
                        id: "r1",
                        amount: 1200,
                        actualExpenditure: 1200,
                        isPartnerPayment: false,
                        category: { slug: "health" },
                        fundedFrom: "reimbursed",
                        description: "Dentist",
                    }),
                ]}
            />,
        );
        expect(
            screen.getByText(
                "Not from this month's income: $3,000.00 — outside the budget.",
            ),
        ).toBeDefined();
        const savings = screen.getByText("From savings").closest("details")!;
        expect(within(savings).getByText("Desk chair")).toBeDefined();
        const reimbursed = screen.getByText("Reimbursed").closest("details")!;
        expect(within(reimbursed).getByText("Dentist")).toBeDefined();
        expect(screen.queryByText(/savings or reimbursed/)).toBeNull();
    });

    it("stays silent when every peso came from this month's income", () => {
        render(<StatStrip {...stats} expenses={[groceries]} />);
        expect(screen.queryByText(/not from this month's income/i)).toBeNull();
        expect(screen.queryByText("From savings")).toBeNull();
    });
});
