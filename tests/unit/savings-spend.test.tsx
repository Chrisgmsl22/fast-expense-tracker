import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

import { SavingsSpendCard } from "@/components/dashboard/SavingsSpendCard";
import { MonthBreakdown } from "@/components/money/MonthBreakdown";
import {
    computeFeedTotals,
    computeSavingsSpend,
    type FeedTotalExpense,
    type FeedTotalMovement,
} from "@/lib/domain/movement";

const expense = (
    overrides: Partial<FeedTotalExpense> & Pick<FeedTotalExpense, "id">,
): FeedTotalExpense => ({
    amount: 100,
    actualExpenditure: 100,
    isPartnerPayment: false,
    category: { slug: "shopping" },
    fundedFrom: "savings",
    ...overrides,
});

const allocation = expense({
    id: "allocation",
    amount: 1000,
    actualExpenditure: 1000,
    category: { slug: "savings" },
});

const expenses = [
    expense({ id: "shared", amount: 1000, actualExpenditure: 630 }),
    expense({ id: "solo", amount: 200, actualExpenditure: 200 }),
    expense({
        id: "payment",
        amount: 350,
        actualExpenditure: 350,
        isPartnerPayment: true,
    }),
    expense({
        id: "income",
        amount: 90,
        actualExpenditure: 90,
        fundedFrom: "income",
    }),
    expense({
        id: "refund",
        amount: 75,
        actualExpenditure: 75,
        fundedFrom: "reimbursed",
        category: { slug: "health" },
    }),
];
const movements: FeedTotalMovement[] = [
    { id: "payment", type: "gf_paid", amount: 350, fundedFrom: "savings" },
    { id: "legacy", type: "gf_paid", amount: 120, fundedFrom: "savings" },
    { id: "received", type: "gf_received", amount: 500, fundedFrom: "savings" },
    { id: "card", type: "card_payment", amount: 800, fundedFrom: "savings" },
    { id: "debt", type: "gf_fronted", amount: 600, fundedFrom: "savings" },
    {
        id: "income-transfer",
        type: "gf_paid",
        amount: 50,
        fundedFrom: "income",
    },
];

describe("computeSavingsSpend", () => {
    it("excludes a savings allocation from purchases without changing the feed total", () => {
        const rows = [
            allocation,
            expense({ id: "purchase", amount: 200, actualExpenditure: 200 }),
        ];
        expect(computeSavingsSpend(rows)).toEqual({
            amount: 200,
            of: { ownPurchases: 200, paidToPartner: 0 },
        });
        expect(computeFeedTotals(rows).notFromIncome.amount).toBe(1200);
    });

    it("uses stored shares, excludes reimbursements, and counts each payment once", () => {
        expect(computeSavingsSpend(expenses, movements)).toEqual({
            amount: 1300,
            of: { ownPurchases: 830, paidToPartner: 470 },
        });
        const totals = computeFeedTotals(expenses, movements);
        expect(totals.notFromIncome.amount).toBe(1255);
        expect(
            totals.paidToPartner.of.notFromIncome.of.fromLegacyTransfers,
        ).toBe(120);
    });

    it("deduplicates a savings movement against an income-funded expense twin", () => {
        expect(
            computeSavingsSpend(
                [
                    expense({
                        id: "twin",
                        fundedFrom: "income",
                        isPartnerPayment: true,
                        category: { slug: "savings" },
                    }),
                ],
                [
                    {
                        id: "twin",
                        type: "gf_paid",
                        amount: 100,
                        fundedFrom: "savings",
                    },
                ],
            ),
        ).toEqual({
            amount: 0,
            of: { ownPurchases: 0, paidToPartner: 0 },
        });
    });

    it.each([
        ["allocation only", [allocation], [], 0, 0, 0],
        [
            "payment in the savings category with a legacy twin",
            [
                expense({
                    id: "payment",
                    isPartnerPayment: true,
                    category: { slug: "savings" },
                }),
            ],
            [
                {
                    id: "payment",
                    type: "gf_paid",
                    amount: 100,
                    fundedFrom: "savings",
                },
            ],
            100,
            0,
            100,
        ],
        ["purchase only", [expense({ id: "purchase" })], [], 100, 100, 0],
        [
            "payment only",
            [expense({ id: "payment", isPartnerPayment: true })],
            [],
            100,
            0,
            100,
        ],
        [
            "legacy only",
            [],
            [
                {
                    id: "legacy",
                    type: "gf_paid",
                    amount: 80,
                    fundedFrom: "savings",
                },
            ],
            80,
            0,
            80,
        ],
        [
            "reimbursed only",
            [expense({ id: "refund", fundedFrom: "reimbursed" })],
            [],
            0,
            0,
            0,
        ],
        ["empty", [], [], 0, 0, 0],
    ] satisfies [
        string,
        FeedTotalExpense[],
        FeedTotalMovement[],
        number,
        number,
        number,
    ][])(
        "handles %s",
        (_name, rows, transfers, amount, ownPurchases, paidToPartner) => {
            expect(computeSavingsSpend(rows, transfers)).toEqual({
                amount,
                of: { ownPurchases, paidToPartner },
            });
        },
    );
});

describe("SavingsSpendCard", () => {
    const props = {
        expenses,
        movements,
        monthLabel: "June 2026",
        partnerName: "Alex",
        incomeTotal: 4000,
    };

    it("shows one savings total and the two parts beneath the outside-income qualifier", () => {
        render(<SavingsSpendCard {...props} />);
        const card = screen.getByRole("region", { name: "Spent from savings" });
        expect(within(card).getByText("$1,300.00")).toBeDefined();
        expect(
            within(card).getByText("Outside this month's income"),
        ).toBeDefined();
        expect(within(card).getByText("Your purchases")).toBeDefined();
        expect(within(card).getByText("$830.00")).toBeDefined();
        expect(within(card).getByText("Paid to Alex")).toBeDefined();
        expect(within(card).getByText("$470.00")).toBeDefined();
        expect(within(card).queryByText("$75.00")).toBeNull();
    });

    it.each([
        { rows: [] },
        { rows: [allocation] },
        { rows: [expense({ id: "refund", fundedFrom: "reimbursed" })] },
    ])("hides the whole card without savings-funded money", ({ rows }) => {
        render(<SavingsSpendCard {...props} expenses={rows} movements={[]} />);
        expect(
            screen.queryByRole("region", { name: "Spent from savings" }),
        ).toBeNull();
        expect(
            screen.queryByRole("button", { name: "View breakdown" }),
        ).toBeNull();
    });

    it("shows only the purchase amount beside a savings allocation", () => {
        render(
            <SavingsSpendCard
                {...props}
                expenses={[
                    allocation,
                    expense({
                        id: "purchase",
                        amount: 200,
                        actualExpenditure: 200,
                    }),
                ]}
                movements={[]}
            />,
        );
        const card = screen.getByRole("region", { name: "Spent from savings" });
        expect(within(card).getByText("$200.00")).toBeDefined();
        expect(within(card).queryByText("$1,200.00")).toBeNull();
        expect(within(card).queryByText("$1,000.00")).toBeNull();
    });

    it("opens the selected month's existing full breakdown and updates with the month", async () => {
        const { rerender } = render(<SavingsSpendCard {...props} />);
        rerender(
            <SavingsSpendCard
                {...props}
                monthLabel="July 2026"
                expenses={[
                    expense({
                        id: "july",
                        amount: 240,
                        actualExpenditure: 240,
                    }),
                ]}
                movements={[]}
            />,
        );
        expect(screen.getByText("$240.00")).toBeDefined();
        expect(screen.queryByText("$1,300.00")).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "View breakdown" }));
        const dialog = await screen.findByRole("dialog", {
            name: "July 2026 breakdown",
        });
        expect(
            within(dialog).getByText("Every figure covers July 2026."),
        ).toBeDefined();
        expect(within(dialog).getAllByText("$240.00").length).toBeGreaterThan(
            0,
        );
        expect(within(dialog).queryByText(/June 2026/)).toBeNull();
    });

    it("agrees with the expenses breakdown and leaves its separate reimbursement intact", () => {
        render(
            <>
                <SavingsSpendCard {...props} />
                <MonthBreakdown
                    totals={computeFeedTotals(expenses, movements)}
                    monthLabel="June 2026"
                    partnerName="Alex"
                />
            </>,
        );
        const card = screen.getByRole("region", { name: "Spent from savings" });
        expect(within(card).getByText("$1,300.00")).toBeDefined();
        const otherMoney =
            screen.getByText("outside the budget").parentElement!;
        expect(within(otherMoney).getByText("$1,375.00")).toBeDefined();
        expect(within(otherMoney).getByText("$905.00")).toBeDefined();
        expect(within(otherMoney).getByText("$470.00")).toBeDefined();
    });
});
