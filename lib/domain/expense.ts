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
 * **Rounded to centavos here, at the single write point**, so a row's stored value
 * IS its displayed value. Any scheme that spreads the leftover cent across a row
 * set gives a different answer for a different set.
 */
export function computeActualExpenditure({
    amount,
    isShared,
    yourPercentage,
}: ActualExpenditureInput): number {
    const raw = isShared ? amount * yourPercentage : amount;
    return Math.round(raw * 100) / 100;
}

/** Sub-cent slack — `amount` is a Float column, so compare money with slack. */
export const isZeroCents = (n: number): boolean => Math.abs(n) < 0.005;

/** The slice of one expense that belongs to the partner, not to you. */
export type PartnerShareInput = { amount: number; actualExpenditure: number };

/**
 * The partner's share of one expense — what she owes you for it. 0 for an
 * unshared row, so summing it over every expense is safe (`partnerShareTotal`).
 */
export function partnerShareOf(e: PartnerShareInput): number {
    return e.amount - e.actualExpenditure;
}

/** What "does this row move the couple balance?" needs to know about a row. */
export type SettlementRelevance = PartnerShareInput & {
    isPartnerPayment: boolean;
};

/**
 * **The one rule for "this expense is part of a settlement".** A payment always
 * counts; any other row counts only when `partnerShareOf` is non-zero. Every caller
 * asks here, so a frozen row is by construction a row its cycle counted.
 */
export function movesSettlementBalance(e: SettlementRelevance): boolean {
    return e.isPartnerPayment || !isZeroCents(partnerShareOf(e));
}

/**
 * Where a payment to the partner lands unless the user picks otherwise (spec 0007
 * §6b) — an existing `isRelevant` category, so no new bucket is invented.
 */
export const PARTNER_PAYMENT_CATEGORY_SLUG = "combined-expenses";

/**
 * Where a payment to the partner is filed (spec 0007 §6a). The seed and
 * `getPartnerPaymentDefaults` both match BY NAME, so this constant, `prisma/seed.ts`
 * and the row rename in `20260916230000_convert_partner_payments` flip together —
 * apart, the next re-seed creates a duplicate instead of finding the renamed row.
 */
export const PARTNER_PAYMENT_SUBCATEGORY_NAME = "Covered for me";

/** The fixed part of the auto-label — only the partner's name follows it. */
const PARTNER_PAYMENT_LABEL_PREFIX = "Transfer — you paid ";

/**
 * A partner payment's `Expense.description`. With no note it falls back to the exact
 * wording the settlement journal titles the same row with.
 */
export function partnerPaymentDescription(
    note: string | null | undefined,
    partnerName: string,
): string {
    return note?.trim() || `${PARTNER_PAYMENT_LABEL_PREFIX}${partnerName}`;
}

/**
 * Is this description the auto-label rather than the user's own text? It matches the
 * fixed PREFIX, not the current partner name: after a rename in Settings the old
 * label would otherwise read as a note and be saved back as one.
 */
export function isPartnerPaymentAutoLabel(description: string): boolean {
    return description.startsWith(PARTNER_PAYMENT_LABEL_PREFIX);
}
