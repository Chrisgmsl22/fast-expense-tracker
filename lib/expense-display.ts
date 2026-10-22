import { CASH_COLOR } from "@/lib/palette";

/**
 * The gold the app already uses for money sent to the partner (`--transfer` in
 * globals.css), repeated as a hex because the row dots take an inline colour.
 */
export const PARTNER_PAYMENT_COLOR = "#ca8a04";

/** What a row shows in its card column: a label and the dot beside it. */
export type ExpenseCardLabel = { name: string; color: string };

/** The translated words a row can show instead of a card name. */
export type ExpenseCardLabelText = { paidPartner: string; cash: string };

/**
 * The card label for one expense row — the single answer both the Expenses list and
 * the dashboard feed read. A payment has no `cardId`, and a plain `?? text.cash` would
 * put the word Cash next to a settlement payment, which is BUG-1's symptom.
 */
export function expenseCardLabel(
    expense: {
        isPartnerPayment: boolean;
        card: { name: string; color: string } | null;
    },
    text: ExpenseCardLabelText,
): ExpenseCardLabel {
    if (expense.isPartnerPayment) {
        return { name: text.paidPartner, color: PARTNER_PAYMENT_COLOR };
    }
    return {
        name: expense.card?.name ?? text.cash,
        color: expense.card?.color ?? CASH_COLOR,
    };
}
