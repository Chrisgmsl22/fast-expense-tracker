import { describe, expect, it } from "vitest";

import { computeBuckets, type CategorySpend } from "@/lib/domain/dashboard";
import {
    computeFeedTotals,
    type FeedTotalExpense,
    type FeedTotalMovement,
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
    id: "pay1",
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
            id: "e1",
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

/**
 * Production data is UNCONVERTED: no migration in this PR turns a `gf_paid`
 * movement into a payment-expense, so on deploy every transfer is still a
 * movement. The footer has to keep counting them, or the gold "you paid her"
 * rows go on rendering above a Total that has silently dropped their money —
 * about $8,011.20 for September — while the settlement page still counts them.
 */
describe("a LEGACY gf_paid movement, until the data PR converts it", () => {
    const legacyTransfer: FeedTotalMovement = {
        id: "mv1",
        amount: 8011.2,
        type: "gf_paid",
    };
    const groceries: FeedTotalExpense = {
        id: "e1",
        amount: 1000,
        actualExpenditure: 680,
        isPartnerPayment: false,
        category: { slug: "groceries" },
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
        // The conversion reuses the movement's id for the expense it creates,
        // so a twin is recognisable without a join table. A half-applied
        // conversion, or a replay against a restored copy, would otherwise
        // double the transfer — and a silently doubled figure is the kind
        // nobody spots until they pay it.
        const converted: FeedTotalExpense = {
            id: "mv1",
            amount: 8011.2,
            actualExpenditure: 8011.2,
            isPartnerPayment: true,
            category: { slug: "combined-expenses" },
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
                { id: "m2", amount: 5000, type: "card_payment" },
                { id: "m3", amount: 300, type: "gf_received" },
                { id: "m4", amount: 900, type: "gf_fronted" },
            ],
        );

        expect(totals.paidToPartner).toBe(0);
        expect(totals.total).toBe(680);
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
