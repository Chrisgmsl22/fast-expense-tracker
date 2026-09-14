import { FUNDING_SOURCE_BADGE, type FundingSource } from "@/lib/domain/funding";

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
 */
const FUNDING_BADGE_CLASS: Record<Exclude<FundingSource, "income">, string> = {
    savings: "bg-transfer-tint text-transfer",
    reimbursed: "bg-payment-tint text-payment",
};

export function FundingBadge({
    fundedFrom,
}: {
    fundedFrom: Exclude<FundingSource, "income">;
}) {
    return (
        <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${FUNDING_BADGE_CLASS[fundedFrom]}`}
        >
            {FUNDING_SOURCE_BADGE[fundedFrom]}
        </span>
    );
}
