import { describe, expect, it } from "vitest";

import { summaryCost, summaryLines } from "@/components/money/summary-model";
import {
    computeFeedTotals,
    nonIncomeFundedRows,
    nonIncomeSourceOf,
    type FeedTotalExpense,
} from "@/lib/domain/movement";

const expense = (
    over: Partial<FeedTotalExpense> & Pick<FeedTotalExpense, "id">,
): FeedTotalExpense => ({
    amount: 0,
    actualExpenditure: 0,
    isPartnerPayment: false,
    category: { slug: "groceries" },
    fundedFrom: "income",
    ...over,
});

/** Invented month with the shape of a real one: every funding source present. */
const october: FeedTotalExpense[] = [
    expense({ id: "i1", amount: 1000, actualExpenditure: 680 }),
    expense({
        id: "s1",
        amount: 4758,
        actualExpenditure: 4758,
        fundedFrom: "savings",
        category: { slug: "shopping" },
    }),
    expense({
        id: "s2",
        amount: 530,
        actualExpenditure: 530,
        fundedFrom: "savings",
        isPartnerPayment: true,
        category: { slug: "combined-expenses" },
    }),
    expense({
        id: "r1",
        amount: 3500,
        actualExpenditure: 3500,
        fundedFrom: "reimbursed",
        category: { slug: "health" },
    }),
];

describe("notFromIncome split by funding source", () => {
    const totals = computeFeedTotals(october);

    it("gives savings and reimbursed money their own figures", () => {
        expect(totals.notFromIncome.fromSavings).toEqual({
            amount: 5288,
            of: { ownSpending: 4758, sentToPartner: 530 },
        });
        expect(totals.notFromIncome.reimbursed).toEqual({
            amount: 3500,
            of: { ownSpending: 3500, sentToPartner: 0 },
        });
    });

    it("keeps the existing parts, and every parent the sum of its leaves", () => {
        const { notFromIncome } = totals;
        expect(notFromIncome.of).toEqual({
            ownSpending: 8258,
            sentToPartner: 530,
        });
        expect(notFromIncome.amount).toBe(8788);
        expect(
            notFromIncome.fromSavings.amount + notFromIncome.reimbursed.amount,
        ).toBe(notFromIncome.amount);
        expect(
            notFromIncome.fromSavings.of.ownSpending +
                notFromIncome.reimbursed.of.ownSpending,
        ).toBe(notFromIncome.of.ownSpending);
        expect(
            notFromIncome.fromSavings.of.sentToPartner +
                notFromIncome.reimbursed.of.sentToPartner,
        ).toBe(notFromIncome.of.sentToPartner);
    });

    it("counts reimbursed money out of My cost, and savings money in", () => {
        // 680 of income + 5,288 of savings. The 3,500 refund was paid back: net 0.
        const cost = summaryCost(totals);
        expect(cost.amount).toBe(5968);
        expect(cost.outsideIncomePercent).toBeCloseTo((5288 / 5968) * 100, 10);
        expect(cost.incomePercent).toBeCloseTo((680 / 5968) * 100, 10);
    });

    it("leaves the charge at the full amount, refund included", () => {
        expect(totals.charged).toEqual({
            amount: 9788,
            of: { myIncome: 680, myNonIncome: 8788, partnerShare: 320 },
        });
    });

    it("files a reimbursed payment to the partner under reimbursed", () => {
        const split = computeFeedTotals([
            expense({
                id: "r2",
                actualExpenditure: 90,
                fundedFrom: "reimbursed",
                isPartnerPayment: true,
            }),
        ]).notFromIncome;
        expect(split.reimbursed.of.sentToPartner).toBe(90);
        expect(split.fromSavings.amount).toBe(0);
    });

    it("cuts the summary line by funding only, and drops a zero part", () => {
        const parts = (rows: FeedTotalExpense[]) =>
            summaryLines(computeFeedTotals(rows), "Avery")
                .find((line) => line.key === "not-from-income")!
                .of.map((part) => [part.key, part.amount]);

        expect(parts(october)).toEqual([
            ["not-from-income-savings", 5288],
            ["not-from-income-reimbursed", 3500],
        ]);
        // One cut per parent: the parts add up to the line they sit in.
        const line = summaryLines(computeFeedTotals(october), "Avery").find(
            (l) => l.key === "not-from-income",
        )!;
        expect(line.of.reduce((sum, part) => sum + part.amount, 0)).toBe(
            line.amount,
        );
        expect(parts(october.slice(0, 2))).toEqual([
            ["not-from-income-savings", 4758],
        ]);
    });
});

describe("nonIncomeSourceOf", () => {
    it.each([
        ["income", null],
        ["savings", "fromSavings"],
        ["reimbursed", "reimbursed"],
    ] as const)("maps %s to %s", (fundedFrom, source) => {
        expect(nonIncomeSourceOf(fundedFrom)).toBe(source);
    });
});

describe("nonIncomeFundedRows", () => {
    it("lists exactly the rows each figure is built from", () => {
        const rows = nonIncomeFundedRows(october);
        const totals = computeFeedTotals(october);
        const sum = (list: FeedTotalExpense[]) =>
            list.reduce((total, row) => total + row.actualExpenditure, 0);

        expect(rows.fromSavings.map((row) => row.id)).toEqual(["s1", "s2"]);
        expect(rows.reimbursed.map((row) => row.id)).toEqual(["r1"]);
        expect(sum(rows.fromSavings)).toBe(
            totals.notFromIncome.fromSavings.amount,
        );
        expect(sum(rows.reimbursed)).toBe(
            totals.notFromIncome.reimbursed.amount,
        );
    });

    it("keeps the caller's own row type, extra fields included", () => {
        const rows = nonIncomeFundedRows([
            { ...october[1]!, description: "Laptop" },
        ]);
        expect(rows.fromSavings[0]!.description).toBe("Laptop");
    });

    it("is empty for a month income paid for", () => {
        expect(nonIncomeFundedRows([october[0]!])).toEqual({
            fromSavings: [],
            reimbursed: [],
        });
    });
});
