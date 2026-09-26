import { describe, expect, it } from "vitest";

import { DEFAULT_BUDGET_RULE } from "@/lib/domain/budget-rule";
import { computeBuckets, type CategorySpend } from "@/lib/domain/dashboard";
import {
    computeFeedTotals,
    type FeedTotalMovement,
} from "@/lib/domain/movement";
import { BUDGET_FUNDING_FILTER } from "@/lib/domain/funding";
import { otherMoneyThatLeft } from "@/components/money/summary-model";
import type { ExpenseListItem } from "@/lib/repositories/expense.repository";

/**
 * The dashboard and the expenses tab must answer the same question with the
 * same number. NOT pinned: the fixtures are already narrowed, so the one input
 * that can make the two disagree — an out-of-band stored value — is invisible.
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
        isPartnerPayment: false,
        cycleClosedAt: null,
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

/** Simulates the repository boundary: it filters the NARROWED value where Postgres filters the raw column. */
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

/** Each call site with the arguments its screen really passes — the risk worth pinning is that the two feed it DIFFERENT rows. */

/** `MonthFeed.tsx`: the whole month, and every movement in it. */
function dashboardTotals(
    expenses: ExpenseListItem[],
    movements: FeedTotalMovement[],
) {
    return computeFeedTotals(expenses, movements);
}

/** `ExpenseListInteractive.tsx`: rows left by the category chip, movements only in the "All" view. */
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
    { id: "m1", type: "gf_paid", amount: 700, fundedFrom: "income" },
    { id: "m2", type: "gf_paid", amount: 250, fundedFrom: "savings" },
    { id: "m3", type: "gf_fronted", amount: 450, fundedFrom: "income" },
    { id: "m4", type: "card_payment", amount: 5000, fundedFrom: "income" },
];

describe("the dashboard and the expenses tab agree (spec 0007 §2)", () => {
    it("gives both screens the same figures in the unfiltered view", () => {
        // No chip active: both screens get the same rows, so every figure must match.
        const dashboard = dashboardTotals(month, movements);
        const expensesTab = expensesTabTotals(month, movements, null);

        expect(expensesTab).toEqual(dashboard);
        // Pinned against the fixtures, so a silently-broken helper can't make
        // both sides equally wrong: only e1 is income-funded consumption.
        expect(dashboard.whatIReallySpent.amount).toBe(680);
        expect(dashboard.paidToPartner.of.fromIncome.amount).toBe(700);
        expect(dashboard.notFromIncome.amount).toBe(3000 + 800);
        expect(dashboard.paidToPartner.of.notFromIncome.amount).toBe(250);
    });

    it("differs under a category chip, and only in the ways the filter implies", () => {
        // Shopping holds e1 (income, share 680) and e2 (savings, 3000).
        const dashboard = dashboardTotals(month, movements);
        const shoppingOnly = expensesTabTotals(month, movements, "c1");

        // The health row is filtered out of the consumption figures…
        expect(shoppingOnly.charged.amount).toBe(1000 + 3000);
        expect(shoppingOnly.whatIReallySpent.amount).toBe(680);
        expect(shoppingOnly.notFromIncome.amount).toBe(3000);
        // …and both transfer figures go to zero, because the chip hides the
        // movements themselves. This is the deliberate difference: the tab is
        // answering "this category", not "this month".
        expect(shoppingOnly.paidToPartner.amount).toBe(0);
        expect(shoppingOnly.total).toBe(680);

        expect(shoppingOnly).not.toEqual(dashboard);
        // The dashboard is untouched by the other screen's filter.
        expect(dashboard.paidToPartner.of.fromIncome.amount).toBe(700);
        expect(dashboard.notFromIncome.amount).toBe(3800);
    });

    it("keeps the two ledgers apart on both screens", () => {
        // 700 income transfer + 250 savings transfer must never merge, and
        // neither may join the consumption exclusion (spec 0007 §6a).
        for (const totals of [
            dashboardTotals(month, movements),
            expensesTabTotals(month, movements, null),
        ]) {
            expect(totals.paidToPartner.of.fromIncome.amount).toBe(700);
            expect(totals.paidToPartner.of.notFromIncome.amount).toBe(250);
            expect(totals.notFromIncome.amount).toBe(3800);
        }
    });

    it("makes that number equal the sum the buckets are built from", () => {
        const totals = computeFeedTotals(month, []);
        const spends = categorySpendsFrom(month);
        const bucketSum = computeBuckets(spends, 0, DEFAULT_BUDGET_RULE).reduce(
            (sum, b) => sum + b.spent,
            0,
        );

        expect(totals.whatIReallySpent.amount).toBe(680);
        expect(totals.whatIReallySpent.amount).toBe(bucketSum);
    });

    it("keeps the excluded money visible and reconcilable", () => {
        const totals = computeFeedTotals(month, []);

        // Charged stays source-agnostic — every charge, at full value.
        expect(totals.charged.amount).toBe(1000 + 3000 + 800);
        // The excluded my-share is surfaced, not hidden.
        expect(totals.notFromIncome.amount).toBe(3000 + 800);
        // And the three reconcile: nothing fell off the edge.
        expect(
            totals.whatIReallySpent.amount + totals.notFromIncome.amount,
        ).toBe(680 + 3000 + 800);
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
            expect(totals.notFromIncome.amount).toBe(5000);
            // It is a transfer, so it never enters `charged` either.
            expect(totals.charged.amount).toBe(0);
            expect(totals.total).toBe(0);
        });

        it("still counts an income-funded savings row as set aside", () => {
            const totals = computeFeedTotals(
                [{ ...savingsRow, fundedFrom: "income" as const }],
                [],
            );

            expect(totals.setAside).toBe(5000);
            expect(totals.notFromIncome.amount).toBe(0);
        });
    });

    it("leaves the partner figures from PR #70 alone", () => {
        // `gf_paid` still lands in the total; a debt (`gf_fronted`) never
        // reaches these totals at all. Funding source changes neither.
        const totals = computeFeedTotals(month, [
            { id: "m1", type: "gf_paid", amount: 700, fundedFrom: "income" },
            { id: "m2", type: "gf_fronted", amount: 450, fundedFrom: "income" },
        ]);

        expect(totals.paidToPartner.amount).toBe(700);
        expect(totals.total).toBe(680 + 0 + 700);
    });

    it("drops a savings-funded transfer from the cash figures, not the row", () => {
        // It used no part of this month's income, so it leaves the budget and
        // cash figures — but the settlement balance still counts it in full.
        const totals = computeFeedTotals(month, [
            { id: "m1", type: "gf_paid", amount: 700, fundedFrom: "savings" },
        ]);

        expect(totals.paidToPartner.of.fromIncome.amount).toBe(0);
        expect(totals.total).toBe(680);
        // Two excluded figures, each in its own ledger, reported separately.
        expect(totals.notFromIncome.amount).toBe(3000 + 800); // consumption
        expect(
            totals.paidToPartner.of.notFromIncome.of.fromLegacyTransfers,
        ).toBe(700); // cash
    });

    describe("the two ledgers are never summed (spec 0007 §6a)", () => {
        // A $680 savings-funded purchase and a $680 savings-funded transfer, the
        // shape §6a was written about. No FIELD may merge them: they belong to
        // different ledgers, and one figure showing $1,360 would read as a double
        // count of a single event.
        const savingsPurchase = expense({
            id: "f1",
            description: "Shoes, from savings",
            amount: 680,
            actualExpenditure: 680,
            fundedFrom: "savings",
        });
        const savingsTransfer = {
            id: "m1",
            type: "gf_paid" as const,
            amount: 680,
            fundedFrom: "savings" as const,
        };

        it("reports the purchase and the transfer as two separate figures", () => {
            const totals = computeFeedTotals(
                [savingsPurchase],
                [savingsTransfer],
            );

            expect(totals.notFromIncome.amount).toBe(680);
            expect(
                totals.paidToPartner.of.notFromIncome.of.fromLegacyTransfers,
            ).toBe(680);
        });

        it("shows $680 twice as two lines, and $1,360 in no field", () => {
            const totals = computeFeedTotals(
                [savingsPurchase],
                [savingsTransfer],
            );

            // EVERY figure the footer can print, parents and parts alike, checked
            // against the sum that would merge the two ledgers.
            const figures = everyFigure(totals);
            expect(figures.length).toBeGreaterThan(9);
            for (const figure of figures) expect(figure).not.toBe(1360);
        });

        it("lets the savings POT hold both, because they are different money", () => {
            // The one figure that deliberately spans them (spec 0007 §6a
            // carve-out): a fronted debt is never an expense, so these $680s can
            // only be two separate outflows — a purchase and a transfer. The modal
            // prints this headline itemised into both halves, never bare; see
            // month-breakdown.test.tsx, "names both halves of a savings pot".
            const totals = computeFeedTotals(
                [savingsPurchase],
                [savingsTransfer],
            );

            expect(otherMoneyThatLeft(totals)).toBe(1360);
            // …and it is the ONLY figure of the two that may: the income pot,
            // asking the same question of this month's income, stays at zero.
            expect(totals.total).toBe(0);
        });

        it("keeps both out of the income figures and the total", () => {
            const totals = computeFeedTotals(
                [savingsPurchase],
                [savingsTransfer],
            );

            expect(totals.whatIReallySpent.amount).toBe(0);
            expect(totals.paidToPartner.of.fromIncome.amount).toBe(0);
            expect(totals.total).toBe(0);
        });
    });
});

/** Every number in the nested totals, so a new field joins the guard by default. */
function everyFigure(value: unknown): number[] {
    if (typeof value === "number") return [value];
    if (value && typeof value === "object") {
        return Object.values(value).flatMap(everyFigure);
    }
    return [];
}
