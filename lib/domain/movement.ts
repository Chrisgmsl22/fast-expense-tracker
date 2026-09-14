/**
 * Pure money-movement domain logic — no DB, no Date, no env, no framework.
 *
 * Movements are actual money events (card payments, transfers to/from the
 * partner), decoupled from what's "owed" and never entering the spend/consumption
 * totals (spec 0003, ADR-0018). Functions here take plain numbers so they're
 * tested without Postgres and reused by services + the feed footer identically.
 */

import { SAVINGS_SLUG } from "./dashboard";
import { BUDGET_FUNDING_SOURCE, type FundingSource } from "./funding";

/** All `Movement.type` values in the schema. */
export type MovementType =
    | "card_payment"
    | "gf_paid"
    | "gf_received"
    // A thing the partner fronted that you owe her (ADR-0020). It shows in the
    // month feed and the settlement journal, but no cash left your account, so
    // it enters no total and never becomes an expense.
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
    category: { slug: string };
    /** Which month's money funded it (spec 0007 §3.1). */
    fundedFrom: FundingSource;
};

/** The figures the feed footer shows (ADR-0018 §1, extended by spec 0007). */
export type FeedTotals = {
    /**
     * Raw card/cash charges — consumption only (excludes savings transfers).
     * Counts EVERY funding source at full value: you really did charge it, and
     * this is the cash-reconciliation figure (spec 0007 §3.2).
     */
    charged: number;
    /**
     * Your share of consumption funded by THIS month's income — the budget
     * number. Excludes savings-funded and reimbursed rows so it equals the sum
     * the dashboard's buckets are built from (spec 0007 §2).
     */
    whatIReallySpent: number;
    /**
     * My-share allocated to Savings this month, income-funded only — so it
     * matches the dashboard's savings bucket.
     */
    setAside: number;
    /** Transfers you sent the partner (`gf_paid`). */
    paidToPartner: number;
    /**
     * My-share that this month's income did NOT fund (savings-funded or
     * reimbursed). Surfaced so `charged` and `whatIReallySpent` reconcile and
     * nothing is hidden; excluded from the budget figures above.
     */
    notFromIncome: number;
    /**
     * This month's income that left = spent + set aside + paid to partner.
     * `notFromIncome` is deliberately NOT added: it came from another month's
     * money, so folding it in would re-create the contradiction with the
     * buckets that spec 0007 exists to remove.
     */
    total: number;
};

/**
 * Footer totals for a month, splitting consumption from the savings transfer so
 * "What I really spent" matches the dashboard's Spent — including its funding
 * filter, so the footer can never contradict the buckets above it. Card payments never enter
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
    let notFromIncome = 0;
    for (const e of expenses) {
        const isSavingsCategory = e.category.slug === SAVINGS_SLUG;
        // `charged` is source-agnostic on purpose — the card saw the charge
        // whatever money settled it (spec 0007 §3.2, ADR-0020 §6).
        if (!isSavingsCategory) charged += e.amount;

        if (e.fundedFrom !== BUDGET_FUNDING_SOURCE) {
            // Another month's money (or a refund). Kept out of BOTH budget
            // figures — including `setAside`, so moving old savings into the
            // Savings category isn't counted as allocating income twice.
            notFromIncome += e.actualExpenditure;
        } else if (isSavingsCategory) {
            setAside += e.actualExpenditure;
        } else {
            whatIReallySpent += e.actualExpenditure;
        }
    }
    return {
        charged,
        whatIReallySpent,
        setAside,
        paidToPartner,
        notFromIncome,
        total: whatIReallySpent + setAside + paidToPartner,
    };
}
