/**
 * Pure money-movement domain logic — no DB, no Date, no env, no framework.
 *
 * Movements are actual money events (card payments, transfers to/from the
 * partner), decoupled from what's "owed" and never entering the spend/consumption
 * totals (spec 0003, ADR-0018). Functions here take plain numbers so they're
 * tested without Postgres and reused by services + the feed footer identically.
 */

import { SAVINGS_SLUG } from "./dashboard";
import {
    BUDGET_FUNDING_SOURCE,
    type FundingSource,
    type TransferFundingSource,
} from "./funding";

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
    /**
     * Transfers you sent the partner (`gf_paid`), funded by THIS month's income
     * only. A transfer paid out of savings is excluded for the same reason a
     * savings-funded expense is: that money was counted as savings in the month
     * it was set aside (spec 0007 §6a decision 5). It still counts in full
     * toward the settlement balance — that is a different ledger.
     */
    paidToPartner: number;
    /**
     * CONSUMPTION ledger: my share of savings-funded or reimbursed expenses.
     * Surfaced so the excluded spend stays visible instead of vanishing.
     *
     * Transfers are deliberately NOT in here. They are the CASH ledger, and
     * spec 0007 §6a forbids any figure that sums across the two: she fronts a
     * $680 dinner (consumption) and he transfers $680 later (cash), so one
     * combined line would print $1,360 for one dinner. The two excluded figures
     * stay apart for the same reason `whatIReallySpent` and `paidToPartner` do.
     */
    notFromIncome: number;
    /**
     * CASH ledger: savings-funded transfers to the partner — the money that
     * left `paidToPartner`. Its own field, never folded into `notFromIncome`
     * (see above) and never into `total`.
     */
    notFromIncomeTransfers: number;
    /**
     * This month's income that left = spent + set aside + paid to partner.
     * Neither excluded figure is added: that money came from another month, so
     * folding it in would re-create the contradiction with the buckets that
     * spec 0007 exists to remove.
     */
    total: number;
};

/** Minimal movement shape the footer totals read. */
export type FeedTotalMovement = {
    type: MovementType;
    amount: number;
    fundedFrom: TransferFundingSource;
};

/**
 * Footer totals for a month, splitting consumption from the savings transfer so
 * "What I really spent" matches the dashboard's Spent — including its funding
 * filter, so the footer can never contradict the buckets above it. Card payments never enter
 * here: their charges were already counted as expenses, so adding them would
 * double-count. `paidToPartner` sums the `gf_paid` movements — new outflow
 * (your share of things the partner fronted) not otherwise captured.
 *
 * It takes the movement ROWS, not a pre-summed number, on purpose: that keeps
 * the funding filter at the one boundary where the figure is derived, so neither
 * feed can sum `gf_paid` its own way and neither can forget to skip a
 * savings-funded transfer (spec 0007 §6a decision 5).
 */
export function computeFeedTotals(
    expenses: FeedTotalExpense[],
    movements: FeedTotalMovement[],
): FeedTotals {
    let paidToPartner = 0;
    let notFromIncomeTransfers = 0;
    for (const m of movements) {
        if (m.type !== "gf_paid") continue;
        // The boundary: a savings-funded transfer never reaches the cash
        // figures. It moves to its own field instead of being subtracted
        // somewhere downstream, so no later arithmetic has to remember it
        // exists — and it stays out of `notFromIncome`, which is the other
        // ledger (spec 0007 §6a).
        if (m.fundedFrom === BUDGET_FUNDING_SOURCE) paidToPartner += m.amount;
        else notFromIncomeTransfers += m.amount;
    }

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
        notFromIncomeTransfers,
        total: whatIReallySpent + setAside + paidToPartner,
    };
}
