/**
 * Pure money-movement domain logic — no DB, no Date, no env, no framework.
 *
 * Movements are actual money events (card payments, transfers to/from the
 * partner), decoupled from what's "owed" and never entering the spend/consumption
 * totals (spec 0003, ADR-0018). Functions here take plain numbers so they're
 * tested without Postgres and reused by services + the feed footer identically.
 */

import { SAVINGS_SLUG } from "./dashboard";

/** All `Movement.type` values in the schema. Only two ship UI so far. */
export type MovementType =
    | "card_payment"
    | "gf_paid"
    | "gf_received"
    | "income"
    | "other";

/** The movement kinds the user can create from the Add menu. */
export const CREATABLE_MOVEMENT_TYPES = ["card_payment", "gf_paid"] as const;

/** Minimal shape the reminder needs from a shared expense. */
export type ExpenseShare = { amount: number; actualExpenditure: number };

/**
 * The partner's total share of the given expenses. For a shared expense it's the
 * slice that isn't yours (`amount − actualExpenditure`); for an unshared one that
 * difference is 0, so summing over every expense is safe.
 */
export function partnerShareTotal(expenses: ExpenseShare[]): number {
    return expenses.reduce(
        (sum, e) => sum + (e.amount - e.actualExpenditure),
        0,
    );
}

/**
 * The soft "partner owes you" reminder (ADR-0018 §4): her share of this month's
 * shared expenses, minus card payments you tagged as funded by her money. It is
 * an *estimate*, not a settled balance — on a netting week it reads high until
 * the offsetting "I paid {partner}" transfer is logged, and that's expected.
 * Never goes below 0 (a negative "she owes you" is meaningless; you'd just be
 * ahead, which the journal shows).
 */
export function partnerOwesYou(
    expenses: ExpenseShare[],
    fundedByPartnerPaymentsTotal: number,
): number {
    return Math.max(
        0,
        partnerShareTotal(expenses) - fundedByPartnerPaymentsTotal,
    );
}

/** Minimal expense shape the footer totals read. */
export type FeedTotalExpense = {
    amount: number;
    actualExpenditure: number;
    category: { slug: string };
};

/** The four figures the feed footer shows (ADR-0018 §1). */
export type FeedTotals = {
    /** Raw card/cash charges — consumption only (excludes savings transfers). */
    charged: number;
    /** Your share of consumption — the budget number ("What I really spent"). */
    whatIReallySpent: number;
    /** My-share allocated to Savings this month. */
    setAside: number;
    /** Transfers you sent the partner (`gf_paid`). */
    paidToPartner: number;
    /** Money that actually left = spent + set aside + paid to partner. */
    total: number;
};

/**
 * Footer totals for a month, splitting consumption from the savings transfer so
 * "What I really spent" matches the dashboard's Spent. Card payments never enter
 * here: their charges were already counted as expenses, so adding them would
 * double-count. `paidToPartner` is the summed `gf_paid` amount — new outflow
 * (your share of things the partner fronted) not otherwise captured.
 */
export function computeFeedTotals(
    expenses: FeedTotalExpense[],
    paidToPartner: number,
): FeedTotals {
    let charged = 0;
    let whatIReallySpent = 0;
    let setAside = 0;
    for (const e of expenses) {
        if (e.category.slug === SAVINGS_SLUG) {
            setAside += e.actualExpenditure;
        } else {
            charged += e.amount;
            whatIReallySpent += e.actualExpenditure;
        }
    }
    return {
        charged,
        whatIReallySpent,
        setAside,
        paidToPartner,
        total: whatIReallySpent + setAside + paidToPartner,
    };
}
