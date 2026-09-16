// @vitest-environment node
import { describe, it, expect } from "vitest";

import { getCategoryDetail } from "@/lib/services/category/category.service";
import type { CategoryBudgetRepository } from "@/lib/repositories/category-budget.repository";
import type {
    CategoryExpenseListItem,
    CategoryMeta,
    CategoryRepository,
} from "@/lib/repositories/category.repository";
import type { SubcategorySpendRow } from "@/lib/domain/category";

const meta: CategoryMeta = {
    id: "cat1",
    slug: "health",
    name: "Health",
    color: "#0d9488",
    isRelevant: true,
    monthlyBudget: 4000,
};

const subSpends: SubcategorySpendRow[] = [
    { id: "s3", name: "Therapy", spent: 800 },
    { id: "s1", name: "Doctors appt", spent: 1400 },
    { id: "s2", name: "Dentist", spent: 1100 },
    { id: "s4", name: "Medicine", spent: 0 },
];

/**
 * A row as the repository returns it. `countedInBudget` defaults to the verdict
 * the DB filter would give this row, so a test only sets it explicitly to build
 * the case the two can disagree on: an out-of-band stored value, which the query
 * drops but `toFundingSource` reads back as `income`.
 */
function exp(
    over: Partial<CategoryExpenseListItem> & { id: string },
): CategoryExpenseListItem {
    const fundedFrom = over.fundedFrom ?? "income";
    return {
        id: over.id,
        date: over.date ?? new Date("2026-06-10T12:00:00Z"),
        description: over.description ?? "x",
        amount: over.amount ?? 100,
        actualExpenditure: over.actualExpenditure ?? 100,
        fundedFrom,
        countedInBudget: over.countedInBudget ?? fundedFrom === "income",
        isShared: over.isShared ?? false,
        category: over.category ?? {
            id: "cat1",
            slug: "health",
            name: "Health",
            color: "#0d9488",
        },
        subcategory: over.subcategory ?? null,
        card: over.card ?? null,
    };
}

function fakeCategoryRepo(
    over: {
        meta?: CategoryMeta | null;
        subSpends?: SubcategorySpendRow[];
        expenses?: CategoryExpenseListItem[];
    } = {},
): CategoryRepository {
    return {
        getBySlug: async () => ("meta" in over ? over.meta! : meta),
        getSubcategorySpends: async () => over.subSpends ?? subSpends,
        getExpensesForCategoryMonth: async () =>
            over.expenses ?? [exp({ id: "e1" }), exp({ id: "e2" })],
    };
}

/** Budget repo whose override read returns `override` (null = no override). */
function fakeBudgetRepo(
    override: number | null = null,
): CategoryBudgetRepository {
    return {
        getOverride: async () => override,
        getOverridesForMonth: async () => new Map(),
        setBudget: async () => {},
    };
}

const NOW = new Date("2026-06-24T12:00:00Z"); // 24 elapsed in June → 6 left

function deps(
    over: {
        catRepo?: CategoryRepository;
        override?: number | null;
    } = {},
) {
    return {
        categoryRepo: over.catRepo ?? fakeCategoryRepo(),
        budgetRepo: fakeBudgetRepo(over.override ?? null),
        now: NOW,
    };
}

describe("getCategoryDetail", () => {
    it("returns null for an unknown slug (page 404s)", async () => {
        const detail = await getCategoryDetail("u1", "nope", "2026-06", {
            categoryRepo: fakeCategoryRepo({ meta: null }),
            budgetRepo: fakeBudgetRepo(),
            now: NOW,
        });
        expect(detail).toBeNull();
    });

    it("assembles spend, default-limit math, and month progress", async () => {
        const detail = await getCategoryDetail(
            "u1",
            "health",
            "2026-06",
            deps(),
        );
        expect(detail).not.toBeNull();
        expect(detail!.spent).toBe(3300); // 800 + 1400 + 1100 + 0
        expect(detail!.limit).toBe(4000); // no override → default
        expect(detail!.defaultBudget).toBe(4000);
        expect(detail!.thisMonthOverride).toBeNull();
        expect(detail!.hasLimit).toBe(true);
        expect(detail!.remaining).toBe(700); // 4000 − 3300
        expect(detail!.over).toBe(false);
        expect(detail!.pctOfLimit).toBeCloseTo((3300 / 4000) * 100, 5);
        expect(detail!.daysLeft).toBe(6);
        expect(detail!.expenseCount).toBe(2);
        expect(detail!.bucket).toBe("essentials");
    });

    it("uses the month override over the default when one is set", async () => {
        const detail = await getCategoryDetail("u1", "health", "2026-06", {
            ...deps({ override: 3000 }),
        });
        expect(detail!.limit).toBe(3000); // override wins
        expect(detail!.defaultBudget).toBe(4000); // default still surfaced
        expect(detail!.thisMonthOverride).toBe(3000);
        expect(detail!.remaining).toBe(-300); // 3000 − 3300
        expect(detail!.over).toBe(true);
    });

    it("orders the breakdown high→low via the domain helper", async () => {
        const detail = await getCategoryDetail(
            "u1",
            "health",
            "2026-06",
            deps(),
        );
        expect(detail!.breakdown.map((b) => b.name)).toEqual([
            "Doctors appt",
            "Dentist",
            "Therapy",
            "Medicine",
        ]);
    });

    it("counts the distinct subcategories on screen, excluding the Other rollup", async () => {
        const detail = await getCategoryDetail("u1", "health", "2026-06", {
            categoryRepo: fakeCategoryRepo({
                expenses: [
                    exp({
                        id: "e1",
                        subcategory: { id: "s1", name: "Doctors appt" },
                    }),
                    exp({
                        id: "e2",
                        subcategory: { id: "s1", name: "Doctors appt" },
                    }),
                    exp({
                        id: "e3",
                        subcategory: { id: "s2", name: "Dentist" },
                    }),
                    exp({ id: "e4", subcategory: null }), // the "Other" rollup
                ],
            }),
            budgetRepo: fakeBudgetRepo(),
            now: NOW,
        });
        expect(detail!.expenseCount).toBe(4);
        expect(detail!.subcatWithSpend).toBe(2); // distinct, and Other is not one
    });

    it("counts two same-named subcategories as two", async () => {
        // `schema.prisma` puts no unique constraint on (userId, categoryId,
        // name), so a user can hold two "Dentist" subcategories. Keying the set
        // on the name collapsed them and printed "across 1 subcategory".
        const detail = await getCategoryDetail("u1", "health", "2026-06", {
            categoryRepo: fakeCategoryRepo({
                expenses: [
                    exp({
                        id: "e1",
                        subcategory: { id: "s1", name: "Dentist" },
                    }),
                    exp({
                        id: "e2",
                        subcategory: { id: "s2", name: "Dentist" },
                    }),
                ],
            }),
            budgetRepo: fakeBudgetRepo(),
            now: NOW,
        });
        expect(detail!.subcatWithSpend).toBe(2);
    });

    it("goes danger when spent exceeds the limit", async () => {
        const detail = await getCategoryDetail("u1", "health", "2026-06", {
            categoryRepo: fakeCategoryRepo({
                subSpends: [{ id: "s1", name: "Doctors appt", spent: 5000 }],
            }),
            budgetRepo: fakeBudgetRepo(),
            now: NOW,
        });
        expect(detail!.over).toBe(true);
        expect(detail!.remaining).toBe(-1000); // 4000 − 5000
    });

    describe("the money `spent` leaves out (spec 0007 §2)", () => {
        // The repository funding-filters the subcategory spends but not the
        // list, so these rows reach the screen and not the total. The service
        // derives the difference from the list for exactly that reason.
        const mixed = [
            exp({ id: "e1", amount: 100, actualExpenditure: 100 }),
            exp({
                id: "e2",
                amount: 3000,
                actualExpenditure: 3000,
                fundedFrom: "savings",
            }),
            exp({
                id: "e3",
                amount: 800,
                actualExpenditure: 800,
                fundedFrom: "reimbursed",
            }),
        ];

        it("sums the savings-funded and reimbursed my-share", async () => {
            const detail = await getCategoryDetail("u1", "health", "2026-06", {
                ...deps({ catRepo: fakeCategoryRepo({ expenses: mixed }) }),
            });
            expect(detail!.spentNotFromIncome).toBe(3800);
            // `spent` still comes from the filtered subcategory spends, so the
            // two figures stay independent — one is the budget, one explains
            // the rows the budget skipped.
            expect(detail!.spent).toBe(3300);
            // And the count still matches what the user can see.
            expect(detail!.expenseCount).toBe(3);
        });

        it("is 0 when every row is income-funded", async () => {
            const detail = await getCategoryDetail(
                "u1",
                "health",
                "2026-06",
                deps(),
            );
            expect(detail!.spentNotFromIncome).toBe(0);
        });

        it("tells one story for a month of nothing but one savings row", async () => {
            // The screen that was contradicting itself: $3,000 of shoes bought
            // from savings, and nothing else all month. The filtered read
            // returns no subcategory spend at all, so every figure the header
            // sentence uses has to come from the list instead.
            const detail = await getCategoryDetail("u1", "health", "2026-06", {
                categoryRepo: fakeCategoryRepo({
                    subSpends: [{ id: "s1", name: "Shoes", spent: 0 }],
                    expenses: [
                        exp({
                            id: "e1",
                            description: "Shoes",
                            amount: 3000,
                            actualExpenditure: 3000,
                            fundedFrom: "savings",
                            subcategory: { id: "s1", name: "Shoes" },
                        }),
                    ],
                }),
                budgetRepo: fakeBudgetRepo(),
                now: NOW,
            });
            expect(detail!.spent).toBe(0); // the budget saw nothing
            expect(detail!.spentNotFromIncome).toBe(3000); // and says so
            // "1 expense across 1 subcategory" — never "across 0".
            expect(detail!.expenseCount).toBe(1);
            expect(detail!.subcatWithSpend).toBe(1);
            // The bars stay empty; the header line is what carries the money,
            // and the breakdown's empty state explains itself from this figure.
            expect(detail!.breakdown.filter((b) => b.spent > 0)).toEqual([]);
        });

        it("counts a row the filter dropped for an unrecognised stored value", async () => {
            // `fundedFrom: "cash-back"` is excluded by the SQL filter, then read
            // back as `income` by `toFundingSource`. Only the filter's own
            // verdict keeps the money in a figure; a predicate over `fundedFrom`
            // would leave this row in neither total.
            const detail = await getCategoryDetail("u1", "health", "2026-06", {
                categoryRepo: fakeCategoryRepo({
                    subSpends: [{ id: "s1", name: "Doctors appt", spent: 0 }],
                    expenses: [
                        exp({
                            id: "e1",
                            amount: 500,
                            actualExpenditure: 500,
                            fundedFrom: "income", // what the mapping reports
                            countedInBudget: false, // what the query decided
                        }),
                    ],
                }),
                budgetRepo: fakeBudgetRepo(),
                now: NOW,
            });
            expect(detail!.spent).toBe(0);
            expect(detail!.spentNotFromIncome).toBe(500);
        });
    });

    it("reads as no-limit when neither override nor default is set", async () => {
        const detail = await getCategoryDetail("u1", "health", "2026-06", {
            categoryRepo: fakeCategoryRepo({
                meta: { ...meta, monthlyBudget: null },
            }),
            budgetRepo: fakeBudgetRepo(),
            now: NOW,
        });
        expect(detail!.limit).toBeNull();
        expect(detail!.hasLimit).toBe(false);
        expect(detail!.remaining).toBeNull();
        expect(detail!.over).toBe(false);
        expect(detail!.pctOfLimit).toBe(0);
    });
});
