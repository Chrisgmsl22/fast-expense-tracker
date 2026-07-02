/**
 * Pure category-detail math — the "spend by subcategory" breakdown. No DB, no
 * IO: the repository sums my-share spend per subcategory, this turns those raw
 * sums into ordered bars with a percent-of-category share. Zero-spend
 * subcategories are kept (they exist in the category) and sink to the end.
 */

/** Raw my-share spend for one subcategory. `id` is null for the "Other" rollup. */
export type SubcategorySpendRow = {
    id: string | null;
    name: string;
    spent: number;
};

/** One bar of the breakdown — a spend row plus its share of the category total. */
export type SubcategoryBar = SubcategorySpendRow & {
    /** `spent ÷ categoryTotal × 100`, or 0 when the category has no spend. */
    pct: number;
};

/**
 * The "Spend by subcategory" bars, high→low. Each carries its percent of the
 * category's total my-share spend; zero-spend subcategories keep a 0% bar and
 * fall to the end (the sort by descending spend puts them there). `categoryTotal`
 * of 0 yields all-0% bars (no divide-by-zero) — every subcategory is faint.
 */
export function subcategoryBreakdown(
    rows: SubcategorySpendRow[],
    categoryTotal: number,
): SubcategoryBar[] {
    return rows
        .map((r) => ({
            ...r,
            pct: categoryTotal > 0 ? (r.spent / categoryTotal) * 100 : 0,
        }))
        .sort((a, b) => b.spent - a.spent);
}

/**
 * The effective monthly limit for a category: a month-specific override wins,
 * otherwise the category's default. `null` from either (or both) means "no
 * limit" — the two ways to express "no limit" collapse to one. See ADR-0016.
 */
export function budgetForMonth(
    defaultBudget: number | null,
    override: number | null,
): number | null {
    return override ?? defaultBudget;
}
