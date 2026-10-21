import { describe, it, expect } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithIntl } from "@/tests/support/intl";

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
    countedInBudget: true,
});

describe("StatStrip", () => {
    it("renders income, spent, net, and daily-average with days left", () => {
        renderWithIntl(<StatStrip {...stats} expenses={[groceries]} />);
        expect(screen.getByText("Income in")).toBeDefined();
        expect(screen.getByText("$48,200.00")).toBeDefined();
        expect(screen.getByText("Spent (my share)")).toBeDefined();
        expect(screen.getByText("Daily avg · 7 left")).toBeDefined();
    });

    it("shows a positive net with a + sign", () => {
        renderWithIntl(<StatStrip {...stats} expenses={[]} />);
        expect(screen.getByText("+$5,900.00")).toBeDefined();
    });

    it("shows a negative net with a minus sign", () => {
        renderWithIntl(
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
        renderWithIntl(
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
                        countedInBudget: false,
                        description: "Desk chair",
                    }),
                    funded({
                        id: "r1",
                        amount: 1200,
                        actualExpenditure: 1200,
                        isPartnerPayment: false,
                        category: { slug: "health" },
                        fundedFrom: "reimbursed",
                        countedInBudget: false,
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
        renderWithIntl(<StatStrip {...stats} expenses={[groceries]} />);
        expect(screen.queryByText(/not from this month's income/i)).toBeNull();
        expect(screen.queryByText("From savings")).toBeNull();
    });
});

describe("StatStrip in Spanish", () => {
    it("labels the stats in Spanish and pluralizes the days left", () => {
        renderWithIntl(<StatStrip {...stats} expenses={[groceries]} />, {
            locale: "es",
        });
        expect(screen.getByText("Ingresos")).toBeDefined();
        expect(screen.getByText("Gastado (mi parte)")).toBeDefined();
        expect(screen.getByText("Neto a la fecha")).toBeDefined();
        expect(screen.getByText("Promedio diario · quedan 7")).toBeDefined();
    });

    it("uses the singular for one day left", () => {
        renderWithIntl(
            <StatStrip {...stats} daysLeft={1} expenses={[groceries]} />,
            { locale: "es" },
        );
        expect(screen.getByText("Promedio diario · queda 1")).toBeDefined();
    });

    it("names the spend this month's income didn't fund in Spanish", () => {
        renderWithIntl(
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
                        countedInBudget: false,
                        description: "Desk chair",
                    }),
                ]}
            />,
            { locale: "es" },
        );
        expect(
            screen.getByText(
                "No salió del ingreso de este mes: $1,800.00 — fuera del presupuesto.",
            ),
        ).toBeDefined();
    });
});
