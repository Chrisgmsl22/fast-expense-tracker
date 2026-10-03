import {
    FUNDING_SOURCE_BADGE,
    UNKNOWN_FUNDING_BADGE,
    type FundingSource,
} from "@/lib/domain/funding";

/**
 * `income` is deliberately not accepted: every row this badge renders is one
 * the budget skipped. `"unknown"` is a skipped row whose stored value narrowed
 * to `income`.
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
            className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${FUNDING_BADGE_CLASS[source]}`}
        >
            {FUNDING_BADGE_TEXT[source]}
        </span>
    );
}

/** Badges any row on `countedInBudget`, so a row the budget skipped is never bare. */
export function RowFundingBadge({
    row,
}: {
    row: { fundedFrom: FundingSource; countedInBudget: boolean };
}) {
    if (row.countedInBudget) return null;
    return (
        <FundingBadge
            source={row.fundedFrom === "income" ? "unknown" : row.fundedFrom}
        />
    );
}
