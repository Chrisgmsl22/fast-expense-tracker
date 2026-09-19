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
import {
    BUDGET_FUNDING_SOURCE,
    type FundingSource,
    type TransferFundingSource,
} from "./funding";

/** All `Movement.type` values in the schema. */
export type MovementType =
    | "card_payment"
    // LEGACY (spec 0007 §6b): nothing writes this type. The conversion migration
    // moves existing rows to `Expense{isPartnerPayment}`, except on an account with
    // no `combined-expenses` category — those keep reading as movements.
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
    /** Which month's money funded it (spec 0007 §3.1). */
    fundedFrom: FundingSource;
};

/**
 * A figure and the parts it is made of. `amount` is always the sum of its parts,
 * so a child can never be read as money beside its parent (BUG-5).
 */
export type Breakdown<Parts> = { amount: number; of: Parts };

/**
 * The two tables a payment to the partner can live in. A legacy `gf_paid` the
 * conversion could not file — an account with no `combined-expenses` category —
 * survives, so a figure naming money that reached her reads both, deduplicated
 * by id (spec 0007 §6a carve-out).
 */
export type PartnerPaymentSources = {
    /** Payment-expenses — already inside the consumption figure this sits under. */
    fromPaymentExpenses: number;
    /** Legacy `gf_paid` movements — cash with no expense row behind it. */
    fromLegacyTransfers: number;
};

/** The figures the feed footer shows (ADR-0018 §1, extended by spec 0007). */
export type FeedTotals = {
    /**
     * Raw card/cash charges — every funding source at full value: you really
     * did charge it (spec 0007 §3.2).
     */
    charged: Breakdown<{
        /** Equals `whatIReallySpent.amount`: the same rows, read as a slice of the charge. */
        myIncome: number;
        /**
         * Smaller than `notFromIncome.amount` when a Savings-category row was
         * funded from savings: that row is consumption, but nothing charged it.
         */
        myNonIncome: number;
        partnerShare: number;
    }>;
    /**
     * Your share of consumption funded by THIS month's income — the budget
     * number. Excludes savings-funded and reimbursed rows so it equals the sum
     * the dashboard's buckets are built from (spec 0007 §2).
     */
    whatIReallySpent: Breakdown<{
        spentOnMyself: number;
        sentToPartner: number;
    }>;
    /**
     * My-share allocated to Savings this month, income-funded only — so it
     * matches the dashboard's savings bucket.
     */
    setAside: number;
    /**
     * CONSUMPTION ledger: non-income-funded expenses, payments to the partner
     * included. Transfers stay out, so this field alone can never merge the two
     * ledgers: a $680 savings purchase and a $680 savings transfer read as two
     * figures here (spec 0007 §6a).
     */
    notFromIncome: Breakdown<{
        ownSpending: number;
        sentToPartner: number;
    }>;
    /**
     * Every peso that reached her, whichever money funded it and whichever table
     * holds it (spec 0007 §6a carve-out). Only `fromLegacyTransfers` is money no
     * figure above already holds, so it is the only piece `total` may add.
     */
    paidToPartner: Breakdown<{
        fromIncome: Breakdown<PartnerPaymentSources>;
        notFromIncome: Breakdown<PartnerPaymentSources>;
    }>;
    /** CASH IN: `gf_received` transfers this month. Never netted against what you paid. */
    partnerPaidYou: number;
    /**
     * This month's income that left. Neither excluded figure is added — that
     * money came from another month.
     */
    total: number;
};

/** Minimal movement shape the footer totals read. */
export type FeedTotalMovement = {
    /** Matched against a payment-expense id to spot a converted twin (ADR-0024). */
    id: string;
    type: MovementType;
    amount: number;
    fundedFrom: TransferFundingSource;
};

/**
 * Footer totals for a month. "What I really spent" carries the dashboard's
 * funding filter, so the footer cannot contradict the buckets above it. Card
 * payments never enter — their charges were already counted as expenses.
 *
 * A legacy `gf_paid` movement that the conversion could not file — an account with
 * no `combined-expenses` category — survives, so it still counts as cash out on its
 * own. The conversion reuses the movement id (ADR-0024); without that the twin dedup
 * below would miss and every converted payment would count twice.
 */
export function computeFeedTotals(
    expenses: FeedTotalExpense[],
    movements: FeedTotalMovement[] = [],
): FeedTotals {
    // Every accumulator is a LEAF of the hierarchy, so each parent below is the
    // sum of its own parts and no peso is added twice or dropped.
    let chargedPartnerShare = 0;
    let chargedNonIncome = 0;
    let spentOnMyself = 0;
    let sentToPartnerFromIncome = 0;
    let setAside = 0;
    let nonIncomeOwnSpending = 0;
    let nonIncomeSentToPartner = 0;
    const paymentExpenseIds = new Set<string>();
    for (const e of expenses) {
        const isSavingsCategory = e.category.slug === SAVINGS_SLUG;
        // The charge slices are source-agnostic on purpose — the card saw the
        // charge whatever money settled it (spec 0007 §3.2, ADR-0020 §6).
        if (!isSavingsCategory) chargedPartnerShare += partnerShareOf(e);
        // Dedup by identity, not by funding: a converted twin is already counted
        // as an expense whichever money funded it.
        if (e.isPartnerPayment) paymentExpenseIds.add(e.id);

        if (e.fundedFrom !== BUDGET_FUNDING_SOURCE) {
            // Another month's money (or a refund). Kept out of BOTH budget
            // figures — including `setAside`, so moving old savings into the
            // Savings category isn't counted as allocating income twice.
            if (!isSavingsCategory) chargedNonIncome += e.actualExpenditure;
            // Named here too, or the money reaching her hides among every
            // unrelated savings-funded row (BUG-5).
            if (e.isPartnerPayment)
                nonIncomeSentToPartner += e.actualExpenditure;
            else nonIncomeOwnSpending += e.actualExpenditure;
        } else if (isSavingsCategory) {
            setAside += e.actualExpenditure;
        } else if (e.isPartnerPayment) {
            sentToPartnerFromIncome += e.actualExpenditure;
        } else {
            spentOnMyself += e.actualExpenditure;
        }
    }

    let legacyFromIncome = 0;
    let legacyNotFromIncome = 0;
    let partnerPaidYou = 0;
    for (const m of movements) {
        if (m.type === "gf_received") {
            partnerPaidYou += m.amount;
            continue;
        }
        if (m.type !== "gf_paid") continue;
        if (paymentExpenseIds.has(m.id)) continue;
        if (m.fundedFrom === BUDGET_FUNDING_SOURCE)
            legacyFromIncome += m.amount;
        else legacyNotFromIncome += m.amount;
    }

    const whatIReallySpent = spentOnMyself + sentToPartnerFromIncome;
    const notFromIncome = nonIncomeOwnSpending + nonIncomeSentToPartner;
    const paidFromIncome = sentToPartnerFromIncome + legacyFromIncome;
    const paidNotFromIncome = nonIncomeSentToPartner + legacyNotFromIncome;

    return {
        charged: {
            amount: whatIReallySpent + chargedNonIncome + chargedPartnerShare,
            of: {
                myIncome: whatIReallySpent,
                myNonIncome: chargedNonIncome,
                partnerShare: chargedPartnerShare,
            },
        },
        whatIReallySpent: {
            amount: whatIReallySpent,
            of: { spentOnMyself, sentToPartner: sentToPartnerFromIncome },
        },
        setAside,
        notFromIncome: {
            amount: notFromIncome,
            of: {
                ownSpending: nonIncomeOwnSpending,
                sentToPartner: nonIncomeSentToPartner,
            },
        },
        paidToPartner: {
            amount: paidFromIncome + paidNotFromIncome,
            of: {
                fromIncome: {
                    amount: paidFromIncome,
                    of: {
                        fromPaymentExpenses: sentToPartnerFromIncome,
                        fromLegacyTransfers: legacyFromIncome,
                    },
                },
                notFromIncome: {
                    amount: paidNotFromIncome,
                    of: {
                        fromPaymentExpenses: nonIncomeSentToPartner,
                        fromLegacyTransfers: legacyNotFromIncome,
                    },
                },
            },
        },
        partnerPaidYou,
        // A legacy transfer is the only addend: every other partner figure is a
        // breakdown of a line already counted (spec 0007 §6a).
        total: whatIReallySpent + setAside + legacyFromIncome,
    };
}

export function computeSavingsSpend(
    expenses: FeedTotalExpense[],
    movements: FeedTotalMovement[] = [],
): Breakdown<{ ownPurchases: number; paidToPartner: number }> {
    // A converted expense owns its id even when its funding source changed.
    const paymentExpenseIds = new Set(
        expenses
            .filter((expense) => expense.isPartnerPayment)
            .map((expense) => expense.id),
    );
    const totals = computeFeedTotals(
        expenses.filter(
            (expense) =>
                expense.fundedFrom === "savings" &&
                (expense.isPartnerPayment ||
                    expense.category.slug !== SAVINGS_SLUG),
        ),
        movements.filter(
            (movement) =>
                movement.fundedFrom === "savings" &&
                !paymentExpenseIds.has(movement.id),
        ),
    );
    const ownPurchases = totals.notFromIncome.of.ownSpending;
    const paidToPartner = totals.paidToPartner.of.notFromIncome.amount;
    return {
        amount: ownPurchases + paidToPartner,
        of: { ownPurchases, paidToPartner },
    };
}
