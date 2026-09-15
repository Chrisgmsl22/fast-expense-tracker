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
    | "gf_paid"
    | "gf_received"
    // LEGACY (spec 0007 §6a): a thing the partner fronted is an
    // `Expense{isFronted:true}` now. Nothing writes this type anymore; the type
    // survives so any row the migration could not convert still reads.
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
    /** A debt the partner fronted — consumption, but no cash of yours moved. */
    isFronted: boolean;
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
 *
 * **A fronted expense is skipped entirely** (spec 0007 §6a decision 4). These are
 * cash figures, and no card or cash of yours moved when she paid; the cash
 * equivalent is the transfer that settles it, already counted in
 * `paidToPartner`. Counting both would bill the same dinner twice. The budget
 * reads the other ledger and counts the expense — one fronted amount, two
 * ledgers, seen exactly once by each.
 */
export function computeFeedTotals(
    expenses: FeedTotalExpense[],
    paidToPartner: number,
): FeedTotals {
    let charged = 0;
    let whatIReallySpent = 0;
    let setAside = 0;
    for (const e of expenses) {
        if (e.isFronted) continue;
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
