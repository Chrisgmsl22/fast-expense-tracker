/**
 * Funding source — which month's money paid for an outflow (spec 0007 §2/§3.1).
 *
 * The three 50/25/25 buckets answer one question: how is *this month's income*
 * being used? Not what was consumed, and not what cash moved. So a purchase
 * funded from savings set aside in an earlier month must not consume this
 * month's budget — that income was already counted as savings back then, and
 * counting it again double-counts. A fully reimbursed purchase is the same
 * shape: a third party paid, so none of this month's income funded it.
 *
 * Pure: no DB, no IO. The data boundary (the dashboard repository) is what
 * actually excludes the rows; this module only defines the vocabulary.
 */

/** The three values, in the order the form offers them. */
export const FUNDING_SOURCES = ["income", "savings", "reimbursed"] as const;

export type FundingSource = (typeof FUNDING_SOURCES)[number];

/**
 * The only value the budget counts. `income` is also the column default, so
 * every pre-existing row keeps today's behaviour exactly.
 */
export const BUDGET_FUNDING_SOURCE: FundingSource = "income";

/**
 * `reimbursed` is restricted to this category (spec 0007 §3.3). Reimbursement
 * in practice means the health-insurance refund; keeping the value out of every
 * other form stops it becoming a catch-all for "money I got back somehow".
 * Loosening this later is a one-line change.
 */
export const REIMBURSABLE_CATEGORY_SLUG = "health";

/**
 * The budget's funding filter, as a where-clause fragment every budget read
 * spreads into its query (spec 0007 §2).
 *
 * It is defined once, here, and applied at the DATA BOUNDARY — never inside the
 * bucket math. The buckets answer "how is *this month's income* being used", so
 * a savings-funded or reimbursed row is not a smaller number, it is not a row.
 * Excluding it in the query means it never reaches `computeBuckets`,
 * `topCategories`, or the category totals, so a future change to that math
 * cannot forget to skip it. Subtracting inside the math would have to be
 * remembered at every new call site; this cannot be bypassed by one.
 *
 * Deliberately NOT applied to card reads: a card sees the full charge whatever
 * money settled it (spec 0007 §3.2, ADR-0020 §6).
 */
export const BUDGET_FUNDING_FILTER = {
    fundedFrom: BUDGET_FUNDING_SOURCE,
} as const;

/** Form/badge wording. The savings phrasing is the user's own. */
export const FUNDING_SOURCE_LABEL: Record<FundingSource, string> = {
    income: "This month's income",
    savings: "Paid with money I already had",
    reimbursed: "Fully reimbursed",
};

/**
 * The agreed wording for money this month's income didn't fund. One phrasing,
 * reused by the dashboard's summary line and by both feed footers, so the same
 * idea never appears under two names.
 */
export const NON_INCOME_FUNDED_LABEL = "Not from this month's income";
export const NON_INCOME_FUNDED_HINT =
    "savings or reimbursed — outside the budget";

/** Short form for a list badge, where the row already gives the context. */
export const FUNDING_SOURCE_BADGE: Record<
    Exclude<FundingSource, "income">,
    string
> = {
    savings: "from savings",
    reimbursed: "reimbursed",
};

/**
 * Narrow a stored string to a `FundingSource`. The column is a plain String
 * (matching `Movement.type`), so a read has to prove the value is one of the
 * three. Anything unrecognised falls back to `income`, the column default: an
 * unknown value must never make spend disappear from the budget silently.
 */
export function toFundingSource(value: string): FundingSource {
    return (FUNDING_SOURCES as readonly string[]).includes(value)
        ? (value as FundingSource)
        : BUDGET_FUNDING_SOURCE;
}

/**
 * Whether `reimbursed` may be chosen for a category (spec 0007 §3.3). A null
 * slug (category not resolved) is not Health, so the answer is no.
 */
export function allowsReimbursed(categorySlug: string | null): boolean {
    return categorySlug === REIMBURSABLE_CATEGORY_SLUG;
}

/**
 * The funding source a form should hold once the category changes.
 *
 * `reimbursed` is Health-only, so carrying it onto another category would only
 * fail server-side validation at submit. It falls back to `income` — the
 * counted default — and the form says so. Every other value survives a category
 * change untouched.
 *
 * Pure, so the rule is testable without driving a select in jsdom. This is a
 * convenience for the user, never the guard: `expenseFundingSchema` still
 * enforces the rule server-side against a slug resolved from the database.
 */
export function fundingSourceAfterCategoryChange(
    current: FundingSource,
    nextCategorySlug: string | null,
): FundingSource {
    return current === "reimbursed" && !allowsReimbursed(nextCategorySlug)
        ? BUDGET_FUNDING_SOURCE
        : current;
}
