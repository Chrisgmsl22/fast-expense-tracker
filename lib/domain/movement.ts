/**
 * Pure money-movement domain logic — no DB, no Date, no env, no framework.
 *
 * Movements are actual money events (card payments, transfers to/from the
 * partner), decoupled from what's "owed" and never entering the spend/consumption
 * totals (spec 0003, ADR-0018). Functions here take plain numbers so they're
 * tested without Postgres and reused by services + the feed footer identically.
 */

import { SAVINGS_SLUG } from "./dashboard";

/** All `Movement.type` values in the schema. */
export type MovementType =
    | "card_payment"
    // LEGACY (spec 0007 §6b): money you sent her is an
    // `Expense{isPartnerPayment:true}` now, because a payment is real spending
    // of yours. Nothing writes this type anymore; the type survives so a row the
    // migration could not convert still reads.
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
 * The partner's total share of the given expenses — the slice that isn't yours
 * (`amount − actualExpenditure`); 0 for an unshared expense, so summing over
 * every expense is safe. This is one input to the two-sided couple balance built
 * in the settlement slice (the "she owes you" side).
 */
export function partnerShareTotal(expenses: ExpenseShare[]): number {
    return expenses.reduce(
        (sum, e) => sum + (e.amount - e.actualExpenditure),
        0,
    );
}

/** Minimal expense shape the footer totals read. */
export type FeedTotalExpense = {
    amount: number;
    actualExpenditure: number;
    /** Money you sent the partner — a real expense of yours (spec 0007 §6b). */
    isPartnerPayment: boolean;
    category: { slug: string };
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
     * The part of `whatIReallySpent` that went to the partner — a BREAKDOWN of
     * it, never an addend. A payment is an ordinary expense now, so it is
     * already inside the figure above.
     */
    paidToPartner: number;
    /** Money that actually left = spent + set aside. */
    total: number;
};

/**
 * Footer totals for a month, splitting consumption from the savings transfer so
 * "What I really spent" matches the dashboard's Spent. Card payments never enter
 * here: their charges were already counted as expenses, so adding them would
 * double-count.
 *
 * **A payment to the partner is an ordinary expense** (spec 0007 §6b): it is his
 * money leaving for something he consumed, so it is counted once, here, like any
 * other row. `paidToPartner` re-reads those same rows as a breakdown line — it
 * is NOT added to the total, or the payment would be billed twice.
 *
 * That is the whole gain of the reversal: under the old model a debt-expense and
 * its settling transfer had to be kept out of each other's ledger by hand. One
 * row now means one figure.
 */
export function computeFeedTotals(expenses: FeedTotalExpense[]): FeedTotals {
    let charged = 0;
    let whatIReallySpent = 0;
    let setAside = 0;
    let paidToPartner = 0;
    for (const e of expenses) {
        if (e.category.slug === SAVINGS_SLUG) {
            setAside += e.actualExpenditure;
            continue;
        }
        charged += e.amount;
        whatIReallySpent += e.actualExpenditure;
        if (e.isPartnerPayment) paidToPartner += e.actualExpenditure;
    }
    return {
        charged,
        whatIReallySpent,
        setAside,
        paidToPartner,
        total: whatIReallySpent + setAside,
    };
}
