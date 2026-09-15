/**
 * Pure expense domain logic — no DB, no Date, no env, no framework.
 *
 * Functions here depend only on their arguments, so they're tested with plain
 * values (no Postgres, no mocks) and reused identically by the create and
 * update server actions.
 */

/** The inputs that determine a user's real share of an expense. */
export type ActualExpenditureInput = {
    amount: number;
    isShared: boolean;
    yourPercentage: number;
};

/**
 * The portion of `amount` that is actually the user's cost.
 *
 * Shared expenses count only `yourPercentage`; the rest is the partner's.
 * Unshared expenses count in full — an unshared expense is never split, even if
 * a stray `yourPercentage` rode along on the input. Stored on the row (spec
 * 0001 §3) so historical splits survive a later change to the default share.
 *
 * **Rounded to centavos, at this single point.** Money is only ever stored to
 * the cent, so a row's displayed value IS its stored value and every view quotes
 * the same figure. Keeping the raw product (1200 × 0.68 = 816.0000000000001) is
 * what made the same expense read $383.99 in one panel and $384.00 in another:
 * downstream panels had to round for display, and any scheme that spreads the
 * leftover cent across a row set gives a different answer for a different set.
 * Rounding here removes the leftover instead of relocating it.
 */
export function computeActualExpenditure({
    amount,
    isShared,
    yourPercentage,
}: ActualExpenditureInput): number {
    const raw = isShared ? amount * yourPercentage : amount;
    return Math.round(raw * 100) / 100;
}

/**
 * Where a fronted expense lands unless the user picks otherwise (spec 0007 §6a).
 * The category already exists for exactly this and is already `isRelevant`, so
 * no new category — and no unclassifiable bucket — is invented.
 */
export const PARTNER_PAYMENT_CATEGORY_SLUG = "combined-expenses";

/**
 * Its subcategory, renamed from "Purchases made by girlfriend": the row is the
 * user's own share, not the partner's purchase, and the name says nothing about
 * who paid — which also makes it work for any account.
 */
export const PARTNER_PAYMENT_SUBCATEGORY_NAME = "Covered for me";

/**
 * A fronted expense's description. The amount entered IS the user's share, so
 * the note is just a label; with none, fall back to the same "I owe {partner}"
 * wording the settlement journal has always shown for an untitled debt.
 */
export function partnerPaymentDescription(
    note: string | null | undefined,
    partnerName: string,
): string {
    return note?.trim() || `I owe ${partnerName}`;
}
