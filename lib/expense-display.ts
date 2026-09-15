import { CASH_COLOR } from "@/lib/palette";

/**
 * The orange the settlement screen already uses for a debt (`--debt` in
 * globals.css). Repeated as a hex because the row dots take an inline colour,
 * the same way `CASH_COLOR` is.
 */
export const FRONTED_COLOR = "#ea580c";

/** What a row shows in its card column: a label and the dot beside it. */
export type ExpenseCardLabel = { name: string; color: string };

/**
 * The card label for one expense row — the single answer both the Expenses list
 * and the dashboard feed read, so the two can never print different words for
 * the same row.
 *
 * A **fronted** row has no `cardId` because the partner's card moved, not one of
 * the user's. Falling back to "Cash" for it, as a plain `?? "Cash"` does, puts
 * the word Cash on screen next to a debt — which is precisely what BUG-1 looked
 * like. The totals stay right, but anyone reading the list would reasonably
 * conclude the bug is back. So say what actually happened instead.
 */
export function expenseCardLabel(
    expense: {
        isFronted: boolean;
        card: { name: string; color: string } | null;
    },
    partnerName: string,
): ExpenseCardLabel {
    if (expense.isFronted) {
        return { name: `Covered by ${partnerName}`, color: FRONTED_COLOR };
    }
    return {
        name: expense.card?.name ?? "Cash",
        color: expense.card?.color ?? CASH_COLOR,
    };
}
