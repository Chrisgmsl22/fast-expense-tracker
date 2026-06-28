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
 * Returns the raw product — it does not round to centavos. That preserves the
 * existing behavior; whether to round is an open decision (architecture ADR).
 */
export function computeActualExpenditure({
    amount,
    isShared,
    yourPercentage,
}: ActualExpenditureInput): number {
    return isShared ? amount * yourPercentage : amount;
}
