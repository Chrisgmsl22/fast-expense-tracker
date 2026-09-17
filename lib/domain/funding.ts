/**
 * Funding source — which month's money paid for an outflow (spec 0007 §2/§3.1).
 * Only `income` reaches the budget: money set aside in an earlier month was
 * already counted as savings then, so counting it again double-counts.
 */

export const FUNDING_SOURCES = ["income", "savings", "reimbursed"] as const;

export type FundingSource = (typeof FUNDING_SOURCES)[number];

/** Also the column default, so every pre-existing row keeps today's behaviour. */
export const BUDGET_FUNDING_SOURCE = "income" as const satisfies FundingSource;

/**
 * `reimbursed` is restricted to this category (spec 0007 §3.3) — in practice
 * the health-insurance refund. Keeping it off every other form stops it
 * becoming a catch-all for "money I got back somehow".
 */
export const REIMBURSABLE_CATEGORY_SLUG = "health";

/**
 * A transfer carries no category, so `reimbursed` (Health-only, §3.3) is
 * neither offered here nor accepted by validation.
 */
export const TRANSFER_FUNDING_SOURCES = [
    "income",
    "savings",
] as const satisfies readonly FundingSource[];

export type TransferFundingSource = (typeof TRANSFER_FUNDING_SOURCES)[number];

/** Both boxes unchecked = `income`: the ordinary case gets no control of its own. */
export function fundingSourceFromToggles(
    paidFromSavings: boolean,
    fullyReimbursed: boolean,
): FundingSource {
    if (fullyReimbursed) return "reimbursed";
    if (paidFromSavings) return "savings";
    return BUDGET_FUNDING_SOURCE;
}

export function togglesFromFundingSource(fundedFrom: FundingSource): {
    paidFromSavings: boolean;
    fullyReimbursed: boolean;
} {
    return {
        paidFromSavings: fundedFrom === "savings",
        fullyReimbursed: fundedFrom === "reimbursed",
    };
}

/**
 * Spread into every budget query — applied at the DATA BOUNDARY, so an excluded
 * row never reaches the bucket math at all. `computeFeedTotals` repeats the rule
 * in TypeScript against the NARROWED value; that copy is the one that can drift.
 */
export const BUDGET_FUNDING_FILTER = {
    fundedFrom: BUDGET_FUNDING_SOURCE,
} as const;

/**
 * Takes the RAW column value, never a narrowed `FundingSource`:
 * `toFundingSource` collapses an unrecognised value to `income` while the SQL
 * filter drops it, so a narrowed predicate counts that row in neither half.
 */
export function isBudgetFunded(storedFundedFrom: string): boolean {
    return storedFundedFrom === BUDGET_FUNDING_SOURCE;
}

export const FUNDING_TOGGLE_LABEL = {
    savings: "Paid with money I already had",
    reimbursed: "Fully reimbursed",
} as const;

export const FUNDING_TOGGLE_HINT =
    "Doesn't count toward this month's budget or the dashboard.";

/** One phrasing, reused by every screen that names this money. */
export const NON_INCOME_FUNDED_LABEL = "Not from this month's income";

/** Short form, for the mobile totals bar. */
export const NON_INCOME_FUNDED_SHORT_LABEL = "Not from income";

export const NON_INCOME_FUNDED_HINT =
    "savings or reimbursed — outside the budget";

/** Names a figure as a breakdown of the line above it, never money beside it. */
export function ofWhichPaidToPartner(partnerName: string): string {
    return `of which paid to ${partnerName}`;
}

/** Short form, for the pinned mobile bar. */
export function ofWhichPaidToPartnerShort(partnerName: string): string {
    return `of which to ${partnerName}`;
}

export const FUNDING_SOURCE_BADGE: Record<
    Exclude<FundingSource, "income">,
    string
> = {
    savings: "from savings",
    reimbursed: "reimbursed",
};

/**
 * For a row the filter dropped whose stored value narrows to `income`. It says
 * only what is certainly true, rather than claiming "from savings" about a
 * value nobody recognises.
 */
export const UNKNOWN_FUNDING_BADGE = "not from income";

/**
 * The column is a plain String, so a read has to prove the value. An unknown
 * one falls back to `income`: it must never make spend vanish silently.
 */
export function toFundingSource(value: string): FundingSource {
    return (FUNDING_SOURCES as readonly string[]).includes(value)
        ? (value as FundingSource)
        : BUDGET_FUNDING_SOURCE;
}

/** Same fallback as `toFundingSource`; `reimbursed` is not a transfer value (§3.3), so it also reads as `income`. */
export function toTransferFundingSource(value: string): TransferFundingSource {
    return (TRANSFER_FUNDING_SOURCES as readonly string[]).includes(value)
        ? (value as TransferFundingSource)
        : BUDGET_FUNDING_SOURCE;
}

/** `reimbursed` may be chosen only for Health (spec 0007 §3.3). */
export function allowsReimbursed(categorySlug: string | null): boolean {
    return categorySlug === REIMBURSABLE_CATEGORY_SLUG;
}

/**
 * A convenience, never the guard: `expenseFundingSchema` still enforces the
 * Health rule server-side against a slug resolved from the database.
 */
export function fundingSourceAfterCategoryChange(
    current: FundingSource,
    nextCategorySlug: string | null,
): FundingSource {
    return current === "reimbursed" && !allowsReimbursed(nextCategorySlug)
        ? BUDGET_FUNDING_SOURCE
        : current;
}
