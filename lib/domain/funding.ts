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
export const BUDGET_FUNDING_SOURCE = "income" as const satisfies FundingSource;

/**
 * `reimbursed` is restricted to this category (spec 0007 §3.3). Reimbursement
 * in practice means the health-insurance refund; keeping the value out of every
 * other form stops it becoming a catch-all for "money I got back somehow".
 * Loosening this later is a one-line change.
 */
export const REIMBURSABLE_CATEGORY_SLUG = "health";

/**
 * What a transfer to the partner may be funded from (spec 0007 §3.1 + §3.3).
 *
 * `reimbursed` is Health-only and a transfer carries no category, so it is not
 * offered and validation rejects it. `satisfies` ties the list back to
 * `FUNDING_SOURCES`, so renaming a value there breaks the build here instead of
 * letting the two lists drift. Everything else (labels, badge wording, the
 * `income` default) is shared with an expense, so a transfer and an expense read
 * identically.
 */
export const TRANSFER_FUNDING_SOURCES = [
    "income",
    "savings",
] as const satisfies readonly FundingSource[];

export type TransferFundingSource = (typeof TRANSFER_FUNDING_SOURCES)[number];

/**
 * The form offers two checkboxes, not a three-value dropdown: the ordinary case
 * (this month's income) is what almost every expense is, so it gets no control
 * of its own — both boxes unchecked means `income`.
 *
 * `reimbursed` wins if both are somehow set. The UI keeps them mutually
 * exclusive, so that branch is unreachable in practice; it exists so the
 * mapping is total rather than throwing on an impossible pair.
 */
export function fundingSourceFromToggles(
    paidFromSavings: boolean,
    fullyReimbursed: boolean,
): FundingSource {
    if (fullyReimbursed) return "reimbursed";
    if (paidFromSavings) return "savings";
    return BUDGET_FUNDING_SOURCE;
}

/** The checkbox states a stored value maps back to (the inverse of above). */
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

/**
 * Checkbox wording. The savings phrasing is the user's own words; both read as
 * something you tick, not as an option you pick from a list.
 */
export const FUNDING_TOGGLE_LABEL = {
    savings: "Paid with money I already had",
    reimbursed: "Fully reimbursed",
} as const;

/** Explains what ticking a box does, in the terms the user cares about. */
export const FUNDING_TOGGLE_HINT =
    "Doesn't count toward this month's budget or the dashboard.";

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

/**
 * Wording for the CASH half — a transfer the partner received out of savings.
 *
 * It gets its own line, and its own words, because spec 0007 §6a forbids any
 * figure that sums consumption and cash. `NON_INCOME_FUNDED_LABEL` above is the
 * consumption half; adding a transfer to it would print the same pesos twice
 * (her fronted dinner, then the transfer settling it). Naming the partner keeps
 * the two lines impossible to confuse at a glance.
 */
export function nonIncomeFundedTransferLabel(partnerName: string): string {
    return `Paid to ${partnerName} from savings`;
}

/** Short form of the same line, for the mobile bar where space is tight. */
export const NON_INCOME_FUNDED_TRANSFER_SHORT_LABEL = "Paid from savings";

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
 * Narrow a stored movement string to a `TransferFundingSource`.
 *
 * Same fallback rule as `toFundingSource` and the same reason: an unrecognised
 * value must never make money disappear from a figure silently, so it reads as
 * `income` — the counted default. `reimbursed` is not a transfer value (§3.3),
 * so a row somehow carrying it also reads as `income` rather than leaking a
 * value no transfer screen knows how to render.
 */
export function toTransferFundingSource(value: string): TransferFundingSource {
    return (TRANSFER_FUNDING_SOURCES as readonly string[]).includes(value)
        ? (value as TransferFundingSource)
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
