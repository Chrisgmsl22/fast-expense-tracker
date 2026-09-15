import { PARTNER_PAYMENT_SUBCATEGORY_NAME } from "@/lib/domain/expense";
import { CASH_COLOR } from "@/lib/palette";

/**
 * The gold the app already uses for money sent to the partner (`--transfer` in
 * globals.css). The highlight follows the payment into its new life as an
 * expense row (spec 0007 §6b), so the same money keeps the same colour wherever
 * it appears. Repeated as a hex because the row dots take an inline colour, the
 * same way `CASH_COLOR` is.
 */
export const PARTNER_PAYMENT_COLOR = "#ca8a04";

/** What a row shows in its card column: a label and the dot beside it. */
export type ExpenseCardLabel = { name: string; color: string };

/** Shown in place of the partner's name when no partner is configured. */
const NEUTRAL_PARTNER_LABEL = "I owed my partner";

/**
 * The subcategory name a row DISPLAYS.
 *
 * Presentation only — nothing is renamed in the database. The seeded
 * "Covered for me" reads as `I owed {partner}`, which says what the payment
 * settled rather than what she bought. It resolves from the configured partner
 * name (CHORE-6.a), so it follows a change in Settings instead of going stale,
 * and stays partner-neutral when nobody is configured: a solo user has no one
 * to owe.
 *
 * Keyed on the SEEDED name rather than on `isPartnerPayment`, so a user who
 * renames this subcategory keeps their own name — an explicit choice outranks a
 * computed default, which is the precedence per-user category management
 * (CHORE-8.c) will need.
 *
 * Any further computed subcategory label belongs here, not at a render site:
 * this is the one place every surface reads.
 */
export function subcategoryLabel(
    storedName: string,
    partnerName: string | null,
): string {
    if (storedName !== PARTNER_PAYMENT_SUBCATEGORY_NAME) return storedName;
    return partnerName?.trim()
        ? `I owed ${partnerName.trim()}`
        : NEUTRAL_PARTNER_LABEL;
}

/**
 * The card label for one expense row — the single answer both the Expenses list
 * and the dashboard feed read, so the two can never print different words for
 * the same row.
 *
 * A **payment to the partner** usually has no `cardId` — the money left a bank
 * account, not a card. Falling back to "Cash" for it, as a plain `?? "Cash"`
 * does, puts the word Cash on screen next to a settlement payment, which is
 * precisely what BUG-1 looked like. The totals stay right, but anyone reading
 * the list would reasonably conclude the bug is back. So say what actually
 * happened instead.
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
