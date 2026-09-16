import { getMonthProgress } from "@/lib/dates";
import {
    budgetForMonth,
    subcategoryBreakdown,
    type SubcategoryBar,
} from "@/lib/domain/category";
import { bucketOf, type BucketKey } from "@/lib/domain/dashboard";
import {
    categoryBudgetRepository,
    categoryRepository,
} from "@/lib/repositories";
import type { CategoryBudgetRepository } from "@/lib/repositories/category-budget.repository";
import type {
    CategoryExpenseListItem,
    CategoryMeta,
    CategoryRepository,
} from "@/lib/repositories/category.repository";

/** Everything the category-detail screen renders. */
export type CategoryDetail = {
    meta: CategoryMeta;
    /** 50/25/25 bucket for the header tag (null = excluded, e.g. Unassigned). */
    bucket: BucketKey | null;
    /** Total my-share spend for the category this month. */
    spent: number;
    /**
     * My-share of every row this category's `spent` left out — the exact
     * complement of the budget's funding filter (spec 0007 §2), so the
     * savings-funded and reimbursed rows and any row holding a value the filter
     * doesn't recognise. Surfaced so the header can say why it shows less money
     * than the list below it; 0 when every row is income-funded, which is every
     * pre-existing row.
     */
    spentNotFromIncome: number;
    /** Effective limit for this month: the month override, else the default. */
    limit: number | null;
    /** The category default (`Category.monthlyBudget`) — editor prefill. */
    defaultBudget: number | null;
    /** This month's override amount, or null if none — editor prefill. */
    thisMonthOverride: number | null;
    /** True when the effective limit is a positive number — gates limit math. */
    hasLimit: boolean;
    /** `limit − spent`, or null when there's no limit. */
    remaining: number | null;
    /** spent > limit (always false when there's no limit). */
    over: boolean;
    /** `spent ÷ limit × 100` (uncapped), or 0 when there's no limit. */
    pctOfLimit: number;
    /** Calendar days remaining in the viewed month. */
    daysLeft: number;
    /** Number of the category's expenses this month — every visible row. */
    expenseCount: number;
    /**
     * Distinct named subcategories among those same visible rows (the "Other"
     * rollup — a null subcategory — is not one, so it never counts).
     */
    subcatWithSpend: number;
    /** "Spend by subcategory" bars, high→low. */
    breakdown: SubcategoryBar[];
    /** The category's expenses this month, date desc. */
    expenses: CategoryExpenseListItem[];
};

/** Injectable seams so the assembly is unit-testable without a DB or the clock. */
export type CategoryDetailDeps = {
    categoryRepo: CategoryRepository;
    budgetRepo: CategoryBudgetRepository;
    now: Date;
};

/**
 * Assemble the category-detail view for `slug` in `month`: metadata + total
 * my-share spend + budget status (spent / limit / remaining) + the
 * spend-by-subcategory breakdown + the month's expenses. Returns `null` for an
 * unknown slug so the page can `notFound()` (no throw). Pure math lives in
 * `lib/domain/category`; this only orchestrates the repository and the clock.
 */
export async function getCategoryDetail(
    userId: string,
    slug: string,
    month: string,
    deps: Partial<CategoryDetailDeps> = {},
): Promise<CategoryDetail | null> {
    const categoryRepo = deps.categoryRepo ?? categoryRepository;
    const budgetRepo = deps.budgetRepo ?? categoryBudgetRepository;
    const now = deps.now ?? new Date();

    const meta = await categoryRepo.getBySlug(userId, slug);
    if (!meta) return null;

    const [subSpends, expenses, override] = await Promise.all([
        categoryRepo.getSubcategorySpends(userId, meta.id, month),
        categoryRepo.getExpensesForCategoryMonth(userId, meta.id, month),
        budgetRepo.getOverride(userId, meta.id, month),
    ]);

    const spent = subSpends.reduce((sum, r) => sum + r.spent, 0);
    // Derived from the LIST, which carries every row, because `subSpends` is
    // already funding-filtered at the data boundary and so cannot see these
    // rows at all. Same my-share basis as `spent`, so the two are comparable.
    //
    // The test is `countedInBudget`, the filter's own verdict, and NOT
    // `fundedFrom !== "income"`: the mapped value reads `income` for an
    // out-of-band stored string that the query dropped, so the narrower
    // predicate would leave that row out of `spent` and out of this figure too.
    const spentNotFromIncome = expenses.reduce(
        (sum, e) => (e.countedInBudget ? sum : sum + e.actualExpenditure),
        0,
    );
    // Effective limit for this month = override ?? default; 0/null → "no limit".
    const limit = budgetForMonth(meta.monthlyBudget, override);
    const hasLimit = limit !== null && limit > 0;
    const remaining = hasLimit ? limit! - spent : null;
    const { daysLeft } = getMonthProgress(month, now);

    return {
        meta,
        bucket: bucketOf(meta),
        spent,
        spentNotFromIncome,
        limit,
        defaultBudget: meta.monthlyBudget,
        thisMonthOverride: override,
        hasLimit,
        remaining,
        over: hasLimit && spent > limit!,
        pctOfLimit: hasLimit ? (spent / limit!) * 100 : 0,
        daysLeft,
        // "N expenses across M subcategories" labels the LIST, so both halves
        // count what the user can see — every row, savings-funded and
        // reimbursed included — unlike `spent`, which is a budget figure and
        // counts only income-funded rows (spec 0007 §2). Keyed on subcategory
        // id, not name: names are not unique per category.
        expenseCount: expenses.length,
        subcatWithSpend: new Set(
            expenses.flatMap((e) => (e.subcategory ? [e.subcategory.id] : [])),
        ).size,
        breakdown: subcategoryBreakdown(subSpends, spent),
        expenses,
    };
}
