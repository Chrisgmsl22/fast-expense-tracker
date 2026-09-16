/**
 * Pure money-movement domain logic — no DB, no Date, no env, no framework.
 *
 * Movements are actual money events (card payments, transfers to/from the
 * partner), decoupled from what's "owed" and never entering the spend/consumption
 * totals (spec 0003, ADR-0018). Functions here take plain numbers so they're
 * tested without Postgres and reused by services + the feed footer identically.
 */

import { SAVINGS_SLUG } from "./dashboard";
import { partnerShareOf } from "./expense";

/** All `Movement.type` values in the schema. */
export type MovementType =
    | "card_payment"
    // LEGACY (spec 0007 §6b): money you sent her is an
    // `Expense{isPartnerPayment:true}` now, because a payment is real spending
    // of yours. Nothing writes this type anymore; the type survives because the
    // conversion of existing rows is deferred (CHORE-12), so they all still read
    // as movements.
    | "gf_paid"
    | "gf_received"
    // A debt she fronted — settlement only, never consumption (spec 0007 §6b).
    // It is provisional: something she owes you can reduce or cancel it before
    // any money moves, so it is not yet an expense of yours.
    | "gf_fronted"
    | "income"
    | "other";

/** Minimal shape the couple-balance math needs from a shared expense. */
export type ExpenseShare = { amount: number; actualExpenditure: number };

/**
 * The partner's total share of the given expenses — the slice that isn't yours;
 * 0 for an unshared expense, so summing over every expense is safe. This is one
 * input to the two-sided couple balance built in the settlement slice (the "she
 * owes you" side).
 *
 * It sums `partnerShareOf`, the same per-row figure the journal shows and the
 * closed-cycle freeze refuses on, so the total and the row set agree by
 * construction.
 */
export function partnerShareTotal(expenses: ExpenseShare[]): number {
    return expenses.reduce((sum, e) => sum + partnerShareOf(e), 0);
}

/** Minimal expense shape the footer totals read. */
export type FeedTotalExpense = {
    /** Matched against a legacy movement's id to spot a converted twin. */
    id: string;
    amount: number;
    actualExpenditure: number;
    /** Money you sent the partner — a real expense of yours (spec 0007 §6b). */
    isPartnerPayment: boolean;
    category: { slug: string };
};

/** Minimal movement shape the footer totals read. */
export type FeedTotalMovement = {
    id: string;
    amount: number;
    type: MovementType;
};

/** The figures the feed footer shows (ADR-0018 §1). */
export type FeedTotals = {
    /** Raw card/cash charges — consumption only (excludes savings transfers). */
    charged: number;
    /** Your share of consumption — the budget number ("What I really spent"). */
    whatIReallySpent: number;
    /** My-share allocated to Savings this month. */
    setAside: number;
    /**
     * Everything that went to the partner this month, from both storage shapes:
     *
     * - a payment-EXPENSE is already inside `whatIReallySpent`, so its part of
     *   this figure is a BREAKDOWN of that one, never an addend;
     * - a legacy `gf_paid` MOVEMENT is not consumption anywhere, so its part is
     *   cash that has been counted nowhere else.
     *
     * Only the second part reaches `total`. See `legacyPaidToPartner`.
     */
    paidToPartner: number;
    /**
     * The legacy-movement slice of `paidToPartner` — the part that is cash out
     * with no consumption row behind it. Exposed because it is the only piece
     * `total` may add, and a caller that added `paidToPartner` instead would
     * bill every converted payment twice.
     */
    legacyPaidToPartner: number;
    /** Money that actually left = spent + set aside + legacy transfers. */
    total: number;
};

/**
 * Footer totals for a month, splitting consumption from the savings transfer so
 * "What I really spent" matches the dashboard's Spent. Card payments never enter
 * here: their charges were already counted as expenses, so adding them would
 * double-count.
 *
 * **A payment to the partner is an ordinary expense** (spec 0007 §6b): it is his
 * money leaving for something he consumed, so it is counted once, among the
 * expenses, like any other row.
 *
 * **A LEGACY `gf_paid` movement is not.** No migration has converted those rows
 * — the conversion is data, deferred to its own PR — so on production every
 * transfer is still a movement. It renders in both feeds, and reading only
 * expenses here would drop the whole "Paid to {partner}" line and shrink Total
 * by the transfer amount, while the settlement page went on counting it. So the
 * legacy rows are added, with two rules:
 *
 * 1. **Never a converted twin.** The deferred data PR must reuse the movement's
 *    id for the expense it creates (a REQUIREMENT on that PR, recorded in
 *    ADR-0024) — so a movement whose id is already a payment-expense is dropped.
 *    The same test, `withoutConvertedTwins`, guards the settlement service. If
 *    that PR ever assigns fresh ids instead, both dedups miss and every
 *    converted transfer counts twice.
 * 2. **Never into a consumption figure.** `charged` and `whatIReallySpent` are
 *    the consumption ledger; a legacy transfer is cash whose consumption was
 *    never recorded. It joins `total` ("what actually left") and the
 *    "Paid to {partner}" line only. The two ledgers stay unsummed (spec 0007
 *    §6a).
 *
 * The set only shrinks: nothing writes `gf_paid` anymore. When the data PR has
 * run, `movements` carries no `gf_paid` and this reduces to the expense-only
 * case — `total` unchanged, since the transfer moves from `legacyPaidToPartner`
 * into `whatIReallySpent`. `charged` and `whatIReallySpent` each RISE by the
 * transfer amount at conversion: that restatement is the point of the model
 * (the payment is consumption now), not an accident of this function.
 */
export function computeFeedTotals(
    expenses: FeedTotalExpense[],
    movements: FeedTotalMovement[] = [],
): FeedTotals {
    let charged = 0;
    let whatIReallySpent = 0;
    let setAside = 0;
    let paidToPartner = 0;
    const paymentExpenseIds = new Set<string>();
    for (const e of expenses) {
        if (e.category.slug === SAVINGS_SLUG) {
            setAside += e.actualExpenditure;
            continue;
        }
        charged += e.amount;
        whatIReallySpent += e.actualExpenditure;
        if (e.isPartnerPayment) {
            paidToPartner += e.actualExpenditure;
            paymentExpenseIds.add(e.id);
        }
    }

    let legacyPaidToPartner = 0;
    for (const m of movements) {
        if (m.type !== "gf_paid") continue;
        if (paymentExpenseIds.has(m.id)) continue;
        legacyPaidToPartner += m.amount;
    }

    return {
        charged,
        whatIReallySpent,
        setAside,
        paidToPartner: paidToPartner + legacyPaidToPartner,
        legacyPaidToPartner,
        total: whatIReallySpent + setAside + legacyPaidToPartner,
    };
}
