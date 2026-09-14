import { describe, expect, it } from "vitest";

import { computeBuckets, type CategorySpend } from "@/lib/domain/dashboard";
import { computeFeedTotals } from "@/lib/domain/movement";
import { BUDGET_FUNDING_FILTER } from "@/lib/domain/funding";
import type { ExpenseListItem } from "@/lib/repositories/expense.repository";

/**
 * The property Christian asked for: the dashboard and the expenses tab must
 * answer the same question with the same number.
 *
 * Both feeds call `computeFeedTotals` on the same rows, and the dashboard's
 * buckets are built from rows the repository filtered with
 * `BUDGET_FUNDING_FILTER`. This asserts the equality directly — a feed footer
 * that drifts from the buckets above it fails here, whichever side moved.
 */

function expense(
    over: Partial<ExpenseListItem> & Pick<ExpenseListItem, "id">,
): ExpenseListItem {
    return {
        date: new Date("2026-06-10T12:00:00Z"),
        description: "row",
        amount: 0,
        actualExpenditure: 0,
        isShared: false,
        fundedFrom: "income",
        category: {
            id: "c1",
            slug: "shopping",
            name: "Shopping",
            color: "#ef4444",
        },
        subcategory: null,
        card: null,
        ...over,
    };
}

/** One month holding all three funding sources. */
const month: ExpenseListItem[] = [
    expense({
        id: "e1",
        description: "Groceries",
        amount: 1000,
        actualExpenditure: 680,
    }),
    expense({
        id: "e2",
        description: "Shoes",
        amount: 3000,
        actualExpenditure: 3000,
        fundedFrom: "savings",
    }),
    expense({
        id: "e3",
        description: "Medicine",
        amount: 800,
        actualExpenditure: 800,
        fundedFrom: "reimbursed",
        category: {
            id: "c2",
            slug: "health",
            name: "Health",
            color: "#14b8a6",
        },
    }),
];

/**
 * What the dashboard repository hands the bucket math: the same rows, with the
 * budget's funding filter applied at the data boundary, summed per category.
 */
function categorySpendsFrom(expenses: ExpenseListItem[]): CategorySpend[] {
    const byCategory = new Map<string, CategorySpend>();
    for (const e of expenses) {
        if (e.fundedFrom !== BUDGET_FUNDING_FILTER.fundedFrom) continue;
        const existing = byCategory.get(e.category.slug);
        if (existing) {
            existing.spent += e.actualExpenditure;
            continue;
        }
        byCategory.set(e.category.slug, {
            slug: e.category.slug,
            name: e.category.name,
            color: e.category.color,
            isRelevant: false,
            spent: e.actualExpenditure,
        });
    }
    return [...byCategory.values()];
}

describe("the dashboard and the expenses tab agree (spec 0007 §2)", () => {
    it("gives both feeds the identical 'what I really spent'", () => {
        // Both screens call the same helper on the same rows, so the only way
        // they could differ is if one screen filtered and the other didn't.
        const dashboardFeed = computeFeedTotals(month, 0);
        const expensesFeed = computeFeedTotals(month, 0);

        expect(dashboardFeed.whatIReallySpent).toBe(
            expensesFeed.whatIReallySpent,
        );
        expect(dashboardFeed).toEqual(expensesFeed);
    });

    it("makes that number equal the sum the buckets are built from", () => {
        // This is the contradiction the slice had to remove: the footer used to
        // count 4480 while the buckets above it counted 680.
        const totals = computeFeedTotals(month, 0);
        const spends = categorySpendsFrom(month);
        const bucketSum = computeBuckets(spends, 0).reduce(
            (sum, b) => sum + b.spent,
            0,
        );

        expect(totals.whatIReallySpent).toBe(680);
        expect(totals.whatIReallySpent).toBe(bucketSum);
    });

    it("keeps the excluded money visible and reconcilable", () => {
        const totals = computeFeedTotals(month, 0);

        // Charged stays source-agnostic — every charge, at full value.
        expect(totals.charged).toBe(1000 + 3000 + 800);
        // The excluded my-share is surfaced, not hidden.
        expect(totals.notFromIncome).toBe(3000 + 800);
        // And the three reconcile: nothing fell off the edge.
        expect(totals.whatIReallySpent + totals.notFromIncome).toBe(
            680 + 3000 + 800,
        );
    });

    describe("a savings-CATEGORY expense funded from savings", () => {
        const savingsRow = expense({
            id: "s1",
            description: "Move old savings",
            amount: 5000,
            actualExpenditure: 5000,
            fundedFrom: "savings",
            category: {
                id: "c3",
                slug: "savings",
                name: "Savings",
                color: "#0d9488",
            },
        });

        it("is not counted as setting income aside", () => {
            // Allocating money that was ALREADY savings isn't this month's
            // income being allocated. Counting it in `setAside` would double
            // count the same pesos — the exact error spec 0007 §2 forbids.
            const totals = computeFeedTotals([savingsRow], 0);

            expect(totals.setAside).toBe(0);
            expect(totals.notFromIncome).toBe(5000);
            // It is a transfer, so it never enters `charged` either.
            expect(totals.charged).toBe(0);
            expect(totals.total).toBe(0);
        });

        it("still counts an income-funded savings row as set aside", () => {
            const totals = computeFeedTotals(
                [{ ...savingsRow, fundedFrom: "income" as const }],
                0,
            );

            expect(totals.setAside).toBe(5000);
            expect(totals.notFromIncome).toBe(0);
        });
    });

    it("leaves the partner figures from PR #70 alone", () => {
        // `gf_paid` still lands in the total; a debt (`gf_fronted`) never
        // reaches these totals at all. Funding source changes neither.
        const totals = computeFeedTotals(month, 700);

        expect(totals.paidToPartner).toBe(700);
        expect(totals.total).toBe(680 + 0 + 700);
    });
});
