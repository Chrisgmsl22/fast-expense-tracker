import { describe, expect, it } from "vitest";

import { computeBuckets, type CategorySpend } from "@/lib/domain/dashboard";
import {
    computeFeedTotals,
    type FeedTotalExpense,
} from "@/lib/domain/movement";

/**
 * Spec 0007 §6a decision 4 — the rule most likely to be got wrong, because each
 * side looks correct in isolation.
 *
 * One dinner she fronted, $680. The consumption ledger sees it as the EXPENSE;
 * the cash ledger sees it as the TRANSFER that settles it. Each ledger counts
 * that money exactly once, by a different route, and no figure ever sums across
 * the two. Counting it in both would bill him twice for one dinner.
 */
const FRONTED = 680;

const frontedExpense: FeedTotalExpense = {
    amount: FRONTED,
    actualExpenditure: FRONTED,
    isFronted: true,
    category: { slug: "combined-expenses" },
};

/** The dashboard reads per-category spend, which INCLUDES the fronted row. */
const frontedCategorySpend: CategorySpend = {
    slug: "combined-expenses",
    name: "Combined Expenses",
    color: "#d97706",
    isRelevant: true,
    spent: FRONTED,
};

describe("a fronted debt lands in exactly one of the two ledgers", () => {
    it("counts in the budget buckets — the whole point of the slice", () => {
        const [essentials] = computeBuckets([frontedCategorySpend], 0);

        // `combined-expenses` is a relevant category, so his share reaches
        // essentials. Before this slice the debt was a settlement-only movement
        // and this figure was 0, understating the month.
        expect(essentials!.spent).toBe(FRONTED);
    });

    it("is excluded from the cash figure, where the transfer stands for it", () => {
        const totals = computeFeedTotals([frontedExpense], FRONTED);

        // The cash ledger sees the $680 ONCE, as the transfer.
        expect(totals.whatIReallySpent).toBe(0);
        expect(totals.charged).toBe(0);
        expect(totals.paidToPartner).toBe(FRONTED);
    });

    it("never appears in both figures at once", () => {
        const consumption = computeBuckets([frontedCategorySpend], 0).reduce(
            (sum, b) => sum + b.spent,
            0,
        );
        const cash = computeFeedTotals(
            [frontedExpense],
            FRONTED,
        ).whatIReallySpent;

        // Exactly one of the two carries it — the sum of both sides is one $680,
        // not two.
        expect(consumption + cash).toBe(FRONTED);
        expect([consumption, cash].filter((n) => n === FRONTED)).toHaveLength(
            1,
        );
    });

    it("leaves an ordinary expense in both figures, as before", () => {
        const groceries: FeedTotalExpense = {
            amount: 1000,
            actualExpenditure: 680,
            isFronted: false,
            category: { slug: "groceries" },
        };
        const totals = computeFeedTotals([groceries, frontedExpense], FRONTED);

        // Only the fronted row is skipped: his own spending still reaches the
        // cash figure in full.
        expect(totals.whatIReallySpent).toBe(680);
        expect(totals.charged).toBe(1000);
    });
});
