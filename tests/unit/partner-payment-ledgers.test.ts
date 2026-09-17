import { describe, expect, it } from "vitest";

import { computeBuckets, type CategorySpend } from "@/lib/domain/dashboard";
import {
    computeFeedTotals,
    type FeedTotalExpense,
    type FeedTotalMovement,
} from "@/lib/domain/movement";

/**
 * Spec 0007 §6b — the reversal. A payment is real money leaving, so it is counted
 * once, as an ordinary expense, in both ledgers; a debt is provisional and reaches
 * neither. One payment, one figure per ledger, never two rows to reconcile.
 */
const PAYMENT = 680;

const paymentExpense: FeedTotalExpense = {
    id: "pay1",
    amount: PAYMENT,
    actualExpenditure: PAYMENT,
    isPartnerPayment: true,
    category: { slug: "combined-expenses" },
    fundedFrom: "income",
};

/** The dashboard reads per-category spend, which includes the payment row. */
const paymentCategorySpend: CategorySpend = {
    slug: "combined-expenses",
    name: "Combined Expenses",
    color: "#d97706",
    isRelevant: true,
    spent: PAYMENT,
};

describe("a payment to the partner is an ordinary expense", () => {
    it("reaches the budget buckets", () => {
        const [essentials] = computeBuckets([paymentCategorySpend], 0);

        // `combined-expenses` is relevant, so the payment lands in essentials.
        expect(essentials!.spent).toBe(PAYMENT);
    });

    it("counts in the cash figure too — it IS money that left", () => {
        const totals = computeFeedTotals([paymentExpense]);

        expect(totals.whatIReallySpent).toBe(PAYMENT);
        expect(totals.charged).toBe(PAYMENT);
    });

    it("appears once: a breakdown of the total, never added on top of it", () => {
        const totals = computeFeedTotals([paymentExpense]);

        // `paidToPartner` re-reads the same row, so adding it to the total would bill
        // the payment twice.
        expect(totals.paidToPartner).toBe(PAYMENT);
        expect(totals.total).toBe(PAYMENT);
    });

    it("leaves an ordinary expense untouched beside it", () => {
        const groceries: FeedTotalExpense = {
            id: "e1",
            amount: 1000,
            actualExpenditure: 680,
            isPartnerPayment: false,
            category: { slug: "groceries" },
            fundedFrom: "income",
        };
        const totals = computeFeedTotals([groceries, paymentExpense]);

        expect(totals.charged).toBe(1000 + PAYMENT);
        expect(totals.whatIReallySpent).toBe(680 + PAYMENT);
        // Only the payment is attributed to her.
        expect(totals.paidToPartner).toBe(PAYMENT);
        expect(totals.total).toBe(680 + PAYMENT);
    });
});

/**
 * Production data is UNCONVERTED: no migration here turns a `gf_paid` movement into a
 * payment-expense, so the footer must keep counting them — or the gold rows render
 * above a Total that silently dropped their money.
 */
describe("a LEGACY gf_paid movement, until the data PR converts it", () => {
    const legacyTransfer: FeedTotalMovement = {
        id: "mv1",
        amount: 8011.2,
        type: "gf_paid",
        fundedFrom: "income",
    };
    const groceries: FeedTotalExpense = {
        id: "e1",
        amount: 1000,
        actualExpenditure: 680,
        isPartnerPayment: false,
        category: { slug: "groceries" },
        fundedFrom: "income",
    };

    it("still reaches the footer when nothing has been converted", () => {
        const totals = computeFeedTotals([groceries], [legacyTransfer]);

        expect(totals.paidToPartner).toBe(8011.2);
        expect(totals.legacyPaidToPartner).toBe(8011.2);
        // Cash that left, added to the cash figure.
        expect(totals.total).toBe(680 + 8011.2);
    });

    it("never enters a consumption figure — the two ledgers stay apart", () => {
        const totals = computeFeedTotals([groceries], [legacyTransfer]);

        // Its consumption was never recorded anywhere, so adding it here would
        // invent spending; `charged` and `whatIReallySpent` see expenses only.
        expect(totals.charged).toBe(1000);
        expect(totals.whatIReallySpent).toBe(680);
    });

    it("is dropped once its converted twin exists — never counted twice", () => {
        // The conversion reuses the movement's id, so a twin is recognisable without a
        // join table. A half-applied conversion would otherwise double the transfer.
        const converted: FeedTotalExpense = {
            id: "mv1",
            amount: 8011.2,
            actualExpenditure: 8011.2,
            isPartnerPayment: true,
            category: { slug: "combined-expenses" },
            fundedFrom: "income",
        };
        const totals = computeFeedTotals([converted], [legacyTransfer]);

        expect(totals.paidToPartner).toBe(8011.2);
        expect(totals.legacyPaidToPartner).toBe(0);
        // Counted once, by the expense — the movement adds nothing on top.
        expect(totals.whatIReallySpent).toBe(8011.2);
        expect(totals.total).toBe(8011.2);
    });

    it("ignores every other movement type", () => {
        const totals = computeFeedTotals(
            [groceries],
            [
                {
                    id: "m2",
                    amount: 5000,
                    type: "card_payment",
                    fundedFrom: "income",
                },
                {
                    id: "m3",
                    amount: 300,
                    type: "gf_received",
                    fundedFrom: "income",
                },
                {
                    id: "m4",
                    amount: 900,
                    type: "gf_fronted",
                    fundedFrom: "income",
                },
            ],
        );

        expect(totals.paidToPartner).toBe(0);
        expect(totals.total).toBe(680);
    });
});

describe("a debt she fronted reaches no ledger", () => {
    it("is not an expense, so no bucket can see it", () => {
        // A debt is a Movement{gf_fronted}: nothing in the expense-shaped input
        // represents it, so there is no exclusion anyone can forget.
        const [essentials] = computeBuckets([], 0);
        expect(essentials!.spent).toBe(0);
    });

    it("is not in the cash figure either", () => {
        const totals = computeFeedTotals([]);
        expect(totals.whatIReallySpent).toBe(0);
        expect(totals.charged).toBe(0);
        expect(totals.paidToPartner).toBe(0);
        expect(totals.total).toBe(0);
    });
});
