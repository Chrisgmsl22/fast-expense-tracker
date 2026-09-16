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
 * **The one rule for "this expense is part of a settlement".**
 *
 * The settlement service reads exactly these two cases: a payment lands on the
 * "you paid her" side whatever its amount, and any other row counts only when
 * `partnerShareOf` is non-zero — an unshared row is skipped outright. Every
 * caller that asks the question asks it here, so a row frozen by a closed cycle
 * is by construction a row that cycle actually counted.
 *
 * Getting this wrong is not cosmetic. The first version of the closed-cycle
 * freeze asked only "was this row created before a close?", which froze the
 * whole expense history — solo lunches included — behind a refusal that told the
 * user they were part of a settlement they were not in.
 */
export function movesSettlementBalance(e: SettlementRelevance): boolean {
    return e.isPartnerPayment || !isZeroCents(partnerShareOf(e));
}

/**
 * Where a payment to the partner lands unless the user picks otherwise (spec
 * 0007 §6b). The category already exists for exactly this and is already
 * `isRelevant`, so no new category — and no unclassifiable bucket — is invented.
 */
export const PARTNER_PAYMENT_CATEGORY_SLUG = "combined-expenses";

/**
 * Its subcategory, as **stored**. This is deliberately the original seeded name,
 * not the "Covered for me" the spec settles on (0007 §6b).
 *
 * Every live database still holds this string, and the rename SQL was pulled out
 * of this PR with the rest of the data migration. Three things match on the
 * name — the seed's find-then-create, `getPartnerPaymentDefaults`, and
 * `subcategoryLabel` — so shipping the new name against unrenamed rows would
 * create a DUPLICATE subcategory on the next re-seed and resolve
 * `subcategoryId: null` on every payment in between.
 *
 * The user-facing name is **computed at render** by `subcategoryLabel`, which
 * already shows "I owed {partner}" here — so the screens read correctly today
 * and no display depends on the stored string.
 *
 * FLIP THIS with the deferred data migration (the payment-is-the-expense data
 * PR): rename the rows by id first, then this constant and the seed together.
 */
export const PARTNER_PAYMENT_SUBCATEGORY_NAME = "Purchases made by girlfriend";

/** The fixed part of the auto-label — only the partner's name follows it. */
const PARTNER_PAYMENT_LABEL_PREFIX = "Transfer — you paid ";

/**
 * A partner payment's description — the `Expense.description` that shows on the
 * Expenses list, the dashboard feed, the category rollup and the settlement
 * breakdown.
 *
 * The amount entered IS what the user sent her, so the note is just a label;
 * with none, fall back to the exact wording the settlement journal titles the
 * same row with, so the two panels never name one row two ways. It says money
 * WENT OUT — "I owe {partner}" described the debt, which is the opposite event
 * and lives in settlement only (spec 0007 §6b).
 */
export function partnerPaymentDescription(
    note: string | null | undefined,
    partnerName: string,
): string {
    return note?.trim() || `${PARTNER_PAYMENT_LABEL_PREFIX}${partnerName}`;
}

/**
 * Is this description the auto-label rather than something the user typed?
 *
 * It matches on the fixed prefix, NOT on the current partner name: renaming the
 * partner in Settings must not turn every older auto-label into a "note". It did
 * exactly that — the settlement journal then prefilled its edit form with the
 * pre-rename label as if the user had written it, and saving froze that stale
 * name onto the row.
 *
 * A user who literally types "Transfer — you paid Ana" loses that text back to
 * the auto-label. That is the cheap direction of the trade: the label is what
 * would render anyway, so nothing visible changes.
 */
export function isPartnerPaymentAutoLabel(description: string): boolean {
    return description.startsWith(PARTNER_PAYMENT_LABEL_PREFIX);
}
