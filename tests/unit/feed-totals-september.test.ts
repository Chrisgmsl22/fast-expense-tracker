import { describe, expect, it } from "vitest";

import {
    computeFeedTotals,
    type FeedTotalExpense,
    type FeedTotalMovement,
} from "@/lib/domain/movement";

/**
 * The owner's real September 2026, rebuilt from its aggregates. Every figure here
 * was reconciled against the live rows, so a change that moves one of them changed
 * the meaning of his money, not just an implementation detail.
 */
const OWN_SPENDING = 11403.3;
const HER_SHARE = 4895.69;
const PAYMENT_EXPENSES = 8047.52;
const FROM_SAVINGS = 11700;
const LEGACY_FROM_INCOME = 15418.71;
const LEGACY_FROM_SAVINGS = 1000;

const expenses: FeedTotalExpense[] = [
    {
        id: "e1",
        amount: OWN_SPENDING + HER_SHARE,
        actualExpenditure: OWN_SPENDING,
        isPartnerPayment: false,
        category: { slug: "groceries" },
        fundedFrom: "income",
    },
    {
        id: "e2",
        amount: PAYMENT_EXPENSES,
        actualExpenditure: PAYMENT_EXPENSES,
        isPartnerPayment: true,
        category: { slug: "combined-expenses" },
        fundedFrom: "income",
    },
    {
        id: "e3",
        amount: FROM_SAVINGS,
        actualExpenditure: FROM_SAVINGS,
        isPartnerPayment: false,
        category: { slug: "shopping" },
        fundedFrom: "savings",
    },
];

const movements: FeedTotalMovement[] = [
    {
        id: "m1",
        type: "gf_paid",
        amount: LEGACY_FROM_INCOME,
        fundedFrom: "income",
    },
    {
        id: "m2",
        type: "gf_paid",
        amount: LEGACY_FROM_SAVINGS,
        fundedFrom: "savings",
    },
];

const totals = computeFeedTotals(expenses, movements);

describe("September 2026, the reconciled month", () => {
    it("reports each headline figure", () => {
        expect(totals.charged.amount).toBeCloseTo(36046.51, 2);
        expect(totals.whatIReallySpent.amount).toBeCloseTo(19450.82, 2);
        expect(totals.setAside).toBe(0);
        expect(totals.notFromIncome.amount).toBeCloseTo(11700, 2);
        expect(totals.paidToPartner.amount).toBeCloseTo(24466.23, 2);
        expect(totals.total).toBeCloseTo(34869.53, 2);
    });

    it("cuts the charge into my income, my savings, and her share", () => {
        expect(totals.charged.of.myIncome).toBeCloseTo(19450.82, 2);
        expect(totals.charged.of.myNonIncome).toBeCloseTo(11700, 2);
        expect(totals.charged.of.partnerShare).toBeCloseTo(4895.69, 2);
    });

    it("splits what reached her by which money funded it", () => {
        expect(totals.paidToPartner.of.fromIncome.amount).toBeCloseTo(
            23466.23,
            2,
        );
        expect(totals.paidToPartner.of.notFromIncome.amount).toBeCloseTo(
            1000,
            2,
        );
        expect(
            totals.paidToPartner.of.fromIncome.of.fromPaymentExpenses,
        ).toBeCloseTo(8047.52, 2);
        expect(
            totals.paidToPartner.of.fromIncome.of.fromLegacyTransfers,
        ).toBeCloseTo(15418.71, 2);
    });

    it("never double-counts the payment-expenses inside what I really spent", () => {
        // THE TRAP: `paidToPartner` is not disjoint from `whatIReallySpent` — the
        // payment-expense half sits inside it. Adding the two overstates the month
        // by exactly that half.
        const doubleCounted =
            totals.whatIReallySpent.amount + totals.paidToPartner.amount;
        expect(doubleCounted).not.toBeCloseTo(totals.total, 2);
        expect(totals.whatIReallySpent.of.sentToPartner).toBeCloseTo(
            totals.paidToPartner.of.fromIncome.of.fromPaymentExpenses,
            2,
        );
    });

    it("closes the bottom line with two slices that do not overlap", () => {
        expect(
            totals.whatIReallySpent.of.spentOnMyself +
                totals.paidToPartner.of.fromIncome.amount +
                totals.setAside,
        ).toBeCloseTo(totals.total, 2);
        expect(totals.whatIReallySpent.of.spentOnMyself).toBeCloseTo(
            11403.3,
            2,
        );
    });

    it("keeps the two cross-checks the owner reconciles by hand", () => {
        expect(
            totals.charged.of.myIncome +
                totals.charged.of.myNonIncome +
                totals.charged.of.partnerShare,
        ).toBeCloseTo(36046.51, 2);
        // The savings pot: consumption funded from savings, plus the transfers
        // that left it. Reported as two figures, never printed as one (§6a).
        expect(
            totals.notFromIncome.amount +
                totals.paidToPartner.of.notFromIncome.of.fromLegacyTransfers,
        ).toBeCloseTo(12700, 2);
    });
});
