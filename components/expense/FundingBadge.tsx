import {
    FUNDING_SOURCE_BADGE,
    UNKNOWN_FUNDING_BADGE,
    type FundingSource,
} from "@/lib/domain/funding";

/**
 * `income` is deliberately not accepted: every row this badge renders is one
 * the budget skipped. `"unknown"` covers the caller that badges from
 * `countedInBudget` and so cannot name the source (see `CategoryExpenses`).
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
