import { describe, expect, it } from "vitest";

import { computeBuckets, type CategorySpend } from "@/lib/domain/dashboard";
import {
    computeFeedTotals,
    type FeedTotalMovement,
} from "@/lib/domain/movement";
import { BUDGET_FUNDING_FILTER } from "@/lib/domain/funding";
import type { ExpenseListItem } from "@/lib/repositories/expense.repository";

/**
 * The property Christian asked for: the dashboard and the expenses tab must
 * answer the same question with the same number.
 *
 * Both feeds call `computeFeedTotals`, and the dashboard's buckets are built
 * from rows the repository filtered with `BUDGET_FUNDING_FILTER`. This asserts
 * the equality directly — a feed footer that drifts from the buckets above it
 * fails here, whichever side moved.
 *
 * The two screens do not pass identical arguments, so each call site is
 * reproduced below with the rows it really sends: the dashboard sends the whole
 * month, the expenses tab sends what the category chip left. Where that makes
 * them differ, the difference is asserted rather than avoided.
 *
 * WHAT THIS DOES NOT PIN — read before trusting the word "agreement". Both
 * sides run through `toFundingSource`. The fixtures are typed `ExpenseListItem`,
 * so their `fundedFrom` is already narrowed, and `categorySpendsFrom` below
 * filters that NARROWED value while the real dashboard filters the RAW column in
 * Postgres. The single input that can make the two disagree is therefore
 * invisible here: a row holding an out-of-band string, which SQL drops from the
 * buckets and `toFundingSource` hands to `computeFeedTotals` as `income`. So
 * what is pinned is that the two screens treat the THREE KNOWN sources alike —
 * not that the TypeScript exclusion mirrors the SQL one.
 *
 * Closing that gap means threading `countedInBudget` (see
 * `category.repository.ts`) through `expense.repository.ts` and both feeds;
 * it is a follow-up, not this slice.
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
 *
 * A SIMULATION of that boundary, not the boundary itself — it filters the
 * narrowed `fundedFrom` these fixtures carry, where Postgres filters the raw
 * column. See the file header for what that leaves unpinned.
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

/**
 * The two call sites, reproduced with the arguments each screen actually
 * passes. Calling the helper twice with one set of rows would pass whatever the
 * implementation did; the risk worth pinning is that the two screens feed it
 * DIFFERENT rows.
 */

/** `MonthFeed.tsx`: the whole month, and every movement in it. */
function dashboardTotals(
    expenses: ExpenseListItem[],
    movements: FeedTotalMovement[],
) {
    return computeFeedTotals(expenses, movements);
}

/**
 * `ExpenseListInteractive.tsx`: the rows left by the category chip, and
 * movements only in the unfiltered "All" view — a movement carries no category,
 * so it can't survive a category filter.
 */
function expensesTabTotals(
    expenses: ExpenseListItem[],
    movements: FeedTotalMovement[],
    activeCategoryId: string | null,
) {
    const filtered = activeCategoryId
        ? expenses.filter((e) => e.category.id === activeCategoryId)
        : expenses;
    const showMovements = activeCategoryId === null;
    return computeFeedTotals(filtered, showMovements ? movements : []);
}

/** A month with all three funding sources, a transfer, and a debt. */
const movements: FeedTotalMovement[] = [
    { type: "gf_paid", amount: 700, fundedFrom: "income" },
    { type: "gf_paid", amount: 250, fundedFrom: "savings" },
    { type: "gf_fronted", amount: 450, fundedFrom: "income" },
    { type: "card_payment", amount: 5000, fundedFrom: "income" },
];

describe("the dashboard and the expenses tab agree (spec 0007 §2)", () => {
    it("gives both screens the same figures in the unfiltered view", () => {
        // No chip active: the expenses tab passes the same rows AND the same
        // movements the dashboard does, so every figure must match — not just
        // the headline one.
        const dashboard = dashboardTotals(month, movements);
        const expensesTab = expensesTabTotals(month, movements, null);

        expect(expensesTab).toEqual(dashboard);
        // Pinned against the fixtures, so a silently-broken helper can't make
        // both sides equally wrong: only e1 is income-funded consumption.
        expect(dashboard.whatIReallySpent).toBe(680);
        expect(dashboard.paidToPartner).toBe(700);
        expect(dashboard.notFromIncome).toBe(3000 + 800);
        expect(dashboard.notFromIncomeTransfers).toBe(250);
    });

    it("differs under a category chip, and only in the ways the filter implies", () => {
        // Shopping holds e1 (income, share 680) and e2 (savings, 3000).
        const dashboard = dashboardTotals(month, movements);
        const shoppingOnly = expensesTabTotals(month, movements, "c1");

        // The health row is filtered out of the consumption figures…
        expect(shoppingOnly.charged).toBe(1000 + 3000);
        expect(shoppingOnly.whatIReallySpent).toBe(680);
        expect(shoppingOnly.notFromIncome).toBe(3000);
        // …and both transfer figures go to zero, because the chip hides the
        // movements themselves. This is the deliberate difference: the tab is
        // answering "this category", not "this month".
        expect(shoppingOnly.paidToPartner).toBe(0);
        expect(shoppingOnly.notFromIncomeTransfers).toBe(0);
        expect(shoppingOnly.total).toBe(680);

        expect(shoppingOnly).not.toEqual(dashboard);
        // The dashboard is untouched by the other screen's filter.
        expect(dashboard.paidToPartner).toBe(700);
        expect(dashboard.notFromIncome).toBe(3800);
    });

    it("keeps the two ledgers apart on both screens", () => {
        // 700 income transfer + 250 savings transfer must never merge, and
        // neither may join the consumption exclusion (spec 0007 §6a).
        for (const totals of [
            dashboardTotals(month, movements),
            expensesTabTotals(month, movements, null),
        ]) {
            expect(totals.paidToPartner).toBe(700);
            expect(totals.notFromIncomeTransfers).toBe(250);
            expect(totals.notFromIncome).toBe(3800);
        }
    });

    it("makes that number equal the sum the buckets are built from", () => {
        // This is the contradiction the slice had to remove: the footer used to
        // count 4480 while the buckets above it counted 680.
        const totals = computeFeedTotals(month, []);
        const spends = categorySpendsFrom(month);
        const bucketSum = computeBuckets(spends, 0).reduce(
            (sum, b) => sum + b.spent,
            0,
        );

        expect(totals.whatIReallySpent).toBe(680);
        expect(totals.whatIReallySpent).toBe(bucketSum);
    });

    it("keeps the excluded money visible and reconcilable", () => {
        const totals = computeFeedTotals(month, []);

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
            const totals = computeFeedTotals([savingsRow], []);

            expect(totals.setAside).toBe(0);
            expect(totals.notFromIncome).toBe(5000);
            // It is a transfer, so it never enters `charged` either.
            expect(totals.charged).toBe(0);
            expect(totals.total).toBe(0);
        });

        it("still counts an income-funded savings row as set aside", () => {
            const totals = computeFeedTotals(
                [{ ...savingsRow, fundedFrom: "income" as const }],
                [],
            );

            expect(totals.setAside).toBe(5000);
            expect(totals.notFromIncome).toBe(0);
        });
    });

    it("leaves the partner figures from PR #70 alone", () => {
        // `gf_paid` still lands in the total; a debt (`gf_fronted`) never
        // reaches these totals at all. Funding source changes neither.
        const totals = computeFeedTotals(month, [
            { type: "gf_paid", amount: 700, fundedFrom: "income" },
            { type: "gf_fronted", amount: 450, fundedFrom: "income" },
        ]);

        expect(totals.paidToPartner).toBe(700);
        expect(totals.total).toBe(680 + 0 + 700);
    });

    it("drops a savings-funded transfer from the cash figures, not the row", () => {
        // Same rule as an expense, applied to the other outflow: it used no
        // part of this month's income, so it leaves the budget and cash
        // figures — but it stays visible, and the settlement balance (a
        // different ledger) still counts it in full.
        const totals = computeFeedTotals(month, [
            { type: "gf_paid", amount: 700, fundedFrom: "savings" },
        ]);

        expect(totals.paidToPartner).toBe(0);
        expect(totals.total).toBe(680);
        // Two excluded figures, each in its own ledger, reported separately.
        expect(totals.notFromIncome).toBe(3000 + 800); // consumption
        expect(totals.notFromIncomeTransfers).toBe(700); // cash
    });

    describe("the two ledgers are never summed (spec 0007 §6a)", () => {
        // The flow the spec describes: she fronts a $680 dinner, he settles it
        // later with a $680 transfer, and both are paid from savings. The same
        // pesos appear in each ledger once, at different moments. Any single
        // figure showing $1,360 is the double count §6a decision 4 names as the
        // rule most likely to be got wrong.
        const fronted = expense({
            id: "f1",
            description: "Dinner she fronted",
            amount: 680,
            actualExpenditure: 680,
            fundedFrom: "savings",
        });
        const settling = {
            type: "gf_paid" as const,
            amount: 680,
            fundedFrom: "savings" as const,
        };

        it("reports the dinner and the transfer as two separate figures", () => {
            const totals = computeFeedTotals([fronted], [settling]);

            expect(totals.notFromIncome).toBe(680);
            expect(totals.notFromIncomeTransfers).toBe(680);
        });

        it("shows $680 twice as two lines, and $1,360 nowhere", () => {
            const totals = computeFeedTotals([fronted], [settling]);

            // Every figure the footer can print, checked against the sum that
            // would mean one dinner got billed twice.
            for (const figure of Object.values(totals)) {
                expect(figure).not.toBe(1360);
            }
        });

        it("keeps both out of the cash total", () => {
            const totals = computeFeedTotals([fronted], [settling]);

            expect(totals.whatIReallySpent).toBe(0);
            expect(totals.paidToPartner).toBe(0);
            expect(totals.total).toBe(0);
        });
    });
});
