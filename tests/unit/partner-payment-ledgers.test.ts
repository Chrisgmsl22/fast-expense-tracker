import { describe, expect, it } from "vitest";

import { computeBuckets, type CategorySpend } from "@/lib/domain/dashboard";
import {
    computeFeedTotals,
    type FeedTotalExpense,
} from "@/lib/domain/movement";

/**
 * Spec 0007 §6b — the reversal. The PAYMENT is the expense; the debt is
 * settlement only.
 *
 * A payment is real money leaving for something he consumed, so it is counted
 * once, as an ordinary expense, in both the budget and the cash figure. A debt
 * is provisional — she may end up owing him instead — so it reaches neither.
 *
 * The property these tests hold down: **one payment, one figure per ledger,
 * never two rows to reconcile.**
 */
const PAYMENT = 680;

const paymentExpense: FeedTotalExpense = {
    amount: PAYMENT,
    actualExpenditure: PAYMENT,
    isPartnerPayment: true,
    category: { slug: "combined-expenses" },
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

        // `paidToPartner` re-reads the same row. Adding it to the total would
        // bill the payment twice — the reconciliation the old model needed by
        // hand, and which this model removes.
        expect(totals.paidToPartner).toBe(PAYMENT);
        expect(totals.total).toBe(PAYMENT);
    });

    it("leaves an ordinary expense untouched beside it", () => {
        const groceries: FeedTotalExpense = {
            amount: 1000,
            actualExpenditure: 680,
            isPartnerPayment: false,
            category: { slug: "groceries" },
        };
        const totals = computeFeedTotals([groceries, paymentExpense]);

        expect(totals.charged).toBe(1000 + PAYMENT);
        expect(totals.whatIReallySpent).toBe(680 + PAYMENT);
        // Only the payment is attributed to her.
        expect(totals.paidToPartner).toBe(PAYMENT);
        expect(totals.total).toBe(680 + PAYMENT);
    });
});

describe("a debt she fronted reaches no ledger", () => {
    it("is not an expense, so no bucket can see it", () => {
        // A debt is a Movement{gf_fronted}. Nothing in the expense-shaped input
        // represents it, which is exactly the point: there is no row to include
        // or exclude, so there is no exclusion anyone can forget.
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
