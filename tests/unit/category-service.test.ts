// @vitest-environment node
import { describe, it, expect } from "vitest";

import { getCategoryDetail } from "@/lib/services/category/category.service";
import type { CategoryBudgetRepository } from "@/lib/repositories/category-budget.repository";
import type {
    CategoryMeta,
    CategoryRepository,
} from "@/lib/repositories/category.repository";
import type { SubcategorySpendRow } from "@/lib/domain/category";
import type { ExpenseListItem } from "@/lib/repositories/expense.repository";

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

function exp(over: Partial<ExpenseListItem> & { id: string }): ExpenseListItem {
    return {
        id: over.id,
        date: over.date ?? new Date("2026-06-10T12:00:00Z"),
        description: over.description ?? "x",
        amount: over.amount ?? 100,
        actualExpenditure: over.actualExpenditure ?? 100,
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
        expenses?: ExpenseListItem[];
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

    it("counts real subcategories with spend, excluding the Other rollup", async () => {
        const detail = await getCategoryDetail("u1", "health", "2026-06", {
            categoryRepo: fakeCategoryRepo({
                subSpends: [
                    { id: "s1", name: "Doctors appt", spent: 1400 },
                    { id: "s2", name: "Dentist", spent: 1100 },
                    { id: null, name: "Other", spent: 300 }, // must not count
                    { id: "s4", name: "Medicine", spent: 0 }, // no spend, no count
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
