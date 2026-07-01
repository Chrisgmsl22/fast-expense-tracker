/**
 * Pure dashboard math — the 50/25/25 bucket model. No DB, no IO: the service
 * feeds it raw per-category spend + income, it returns the bucket figures the
 * hero renders. Bucket definitions per docs/reference/domain-reference.md §1
 * ("Important nuance for 50/25/25 logic") + CLAUDE.md.
 */

export type BucketKey = "essentials" | "discretionary" | "savings";

/**
 * One category's my-share spend for the month + the fields that classify it.
 * `name`/`color` are carried for the radar (top-categories); the bucket math
 * only reads `slug`/`isRelevant`/`spent`.
 */
export type CategorySpend = {
    slug: string;
    name: string;
    color: string;
    isRelevant: boolean;
    spent: number;
};

/** A category's slice of the radar — name + color + my-share spend. */
export type TopCategory = {
    name: string;
    color: string;
    spent: number;
};

export type Bucket = {
    key: BucketKey;
    spent: number;
    /** `income × ratio` — the 50/25/25 target. */
    target: number;
};

const SAVINGS_SLUG = "savings";
const UNASSIGNED_SLUG = "unassigned";

/** Target share of income per bucket — the 50/25/25 rule. */
export const BUCKET_RATIO: Record<BucketKey, number> = {
    essentials: 0.5,
    discretionary: 0.25,
    savings: 0.25,
};

/**
 * Which bucket a category belongs to, or `null` if it's excluded from the
 * 50/25/25 view. Savings is its own bucket (not essentials) even though it's
 * `isRelevant`; the Unassigned sentinel is excluded entirely.
 */
export function bucketOf(category: {
    slug: string;
    isRelevant: boolean;
}): BucketKey | null {
    if (category.slug === SAVINGS_SLUG) return "savings";
    if (category.slug === UNASSIGNED_SLUG) return null;
    return category.isRelevant ? "essentials" : "discretionary";
}

/**
 * The three 50/25/25 buckets with summed spend + income-derived targets, always
 * in essentials → discretionary → savings order. Unassigned spend is excluded
 * here (it has no bucket) but still counts toward the dashboard's total spend.
 */
export function computeBuckets(
    categorySpends: CategorySpend[],
    incomeTotal: number,
): Bucket[] {
    const spentByKey: Record<BucketKey, number> = {
        essentials: 0,
        discretionary: 0,
        savings: 0,
    };
    for (const c of categorySpends) {
        const key = bucketOf(c);
        if (key) spentByKey[key] += c.spent;
    }
    return (Object.keys(BUCKET_RATIO) as BucketKey[]).map((key) => ({
        key,
        spent: spentByKey[key],
        target: incomeTotal * BUCKET_RATIO[key],
    }));
}

/**
 * The `limit` highest-spend categories for the radar ("where the money went"),
 * high→low. Zero-spend categories are dropped — a radar spoke at 0 is noise. The
 * Unassigned sentinel is excluded (it's not a real spending area).
 */
export function topCategories(
    categorySpends: CategorySpend[],
    limit = 5,
): TopCategory[] {
    return categorySpends
        .filter((c) => c.spent > 0 && c.slug !== UNASSIGNED_SLUG)
        .sort((a, b) => b.spent - a.spent)
        .slice(0, limit)
        .map((c) => ({ name: c.name, color: c.color, spent: c.spent }));
}
