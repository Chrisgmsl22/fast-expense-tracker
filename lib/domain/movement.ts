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
    // LEGACY (spec 0007 §6b): nothing writes this type; the conversion of existing
    // rows is deferred, so they all still read as movements.
    | "gf_paid"
    | "gf_received"
    // A debt she fronted — settlement only, provisional until money moves (spec 0007 §6b).
    | "gf_fronted"
    | "income"
    | "other";

/** Minimal shape the couple-balance math needs from a shared expense. */
export type ExpenseShare = { amount: number; actualExpenditure: number };

/**
 * The partner's total share of the given expenses — 0 for an unshared expense, so
 * summing over every expense is safe.
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
     * Everything that went to the partner this month. The payment-expense part is a
     * BREAKDOWN of `whatIReallySpent`, never an addend — only `legacyPaidToPartner` is.
     */
    paidToPartner: number;
    /**
     * The legacy-movement slice of `paidToPartner` — cash with no consumption row
     * behind it, and the only piece `total` may add.
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
 * Legacy `gf_paid` movements are still unconverted on production, so they count as
 * cash out — never into `charged` / `whatIReallySpent`. The conversion must reuse the
 * movement id (ADR-0024), or the twin dedup below misses and every one counts twice.
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
