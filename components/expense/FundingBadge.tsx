import {
    FUNDING_SOURCE_BADGE,
    UNKNOWN_FUNDING_BADGE,
    type FundingSource,
} from "@/lib/domain/funding";

/**
 * Funding-source badge for a row the budget skipped (spec 0007 §3.1).
 *
 * Shared by the expenses list and the dashboard's month feed, so a
 * savings-funded purchase reads identically wherever it appears — same wording,
 * same colours. Reuses existing tokens rather than inventing any: amber
 * `transfer` for savings (money moved in from another month) and blue `payment`
 * for reimbursed (money came back). Neither collides with the green a
 * savings-CATEGORY row already uses, so "set aside" and "from savings" stay
 * tellable apart.
 *
 * `income` is NOT a value this badge accepts, and the type says so. Every row it
 * renders is a row the budget skipped, so an `income` badge would state something
 * false about ordinary money — the compiler is what stops a caller from reaching
 * here with one, rather than an inline `!== "income"` at each of the five call
 * sites that a refactor could quietly drop.
 *
 * `"unknown"` covers the one caller that cannot name the source: the category
 * list badges from `countedInBudget`, the SQL filter's own verdict, and an
 * out-of-band stored value narrows to `income` while still being uncounted. That
 * caller maps the case to `"unknown"` itself, so the neutral rendering is named
 * where it is owned instead of being inferred from `income` in here.
 */
export type FundingBadgeSource = Exclude<FundingSource, "income"> | "unknown";

const FUNDING_BADGE_CLASS: Record<FundingBadgeSource, string> = {
    savings: "bg-transfer-tint text-transfer",
    reimbursed: "bg-payment-tint text-payment",
    // Neutral, so an unnameable source never borrows savings' or reimbursed's colour.
    unknown: "bg-muted text-muted-foreground",
};

const FUNDING_BADGE_TEXT: Record<FundingBadgeSource, string> = {
    ...FUNDING_SOURCE_BADGE,
    unknown: UNKNOWN_FUNDING_BADGE,
};

export function FundingBadge({ source }: { source: FundingBadgeSource }) {
    return (
        <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${FUNDING_BADGE_CLASS[source]}`}
        >
            {FUNDING_BADGE_TEXT[source]}
        </span>
    );
}
