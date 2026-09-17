import { CASH_COLOR } from "@/lib/palette";

/**
 * The gold the app already uses for money sent to the partner (`--transfer` in
 * globals.css), repeated as a hex because the row dots take an inline colour.
 */
export const PARTNER_PAYMENT_COLOR = "#ca8a04";

/** What a row shows in its card column: a label and the dot beside it. */
export type ExpenseCardLabel = { name: string; color: string };

/**
 * The card label for one expense row — the single answer both the Expenses list and
 * the dashboard feed read. A payment has no `cardId`, and a plain `?? "Cash"` would
 * put the word Cash next to a settlement payment, which is BUG-1's symptom.
 */
export function expenseCardLabel(
    expense: {
        isPartnerPayment: boolean;
        card: { name: string; color: string } | null;
    },
    partnerName: string,
): ExpenseCardLabel {
    if (expense.isPartnerPayment) {
        return {
            name: `Paid ${partnerName}`,
            color: PARTNER_PAYMENT_COLOR,
        };
    }
    return {
        name: expense.card?.name ?? "Cash",
        color: expense.card?.color ?? CASH_COLOR,
    };
}
