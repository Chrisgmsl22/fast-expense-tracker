import type {
    FundedExpense,
    FundingRows,
} from "@/components/money/FundingSplit";
import {
    nonIncomeFundedRows,
    type FeedTotalExpense,
} from "@/lib/domain/movement";

/** Gives a totals fixture the fields the funding split lists; overrides win. */
export function funded(
    e: FeedTotalExpense & Partial<FundedExpense>,
): FundedExpense {
    return {
        description: `Expense ${e.id}`,
        date: new Date("2026-06-10T12:00:00Z"),
        ...e,
    };
}

/** The rows behind a fixture's `notFromIncome`, by the domain's own predicate. */
export function fundingRowsOf(expenses: FeedTotalExpense[]): FundingRows {
    return nonIncomeFundedRows(expenses.map(funded));
}
