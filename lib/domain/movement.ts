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
    | "partner_debt"
    | "income"
    | "other";

/** Settlement-only debts, with positive amounts in either direction. */
export const PARTNER_DEBT_TYPES = ["gf_fronted", "partner_debt"] as const;
export type PartnerDebtDirection = (typeof PARTNER_DEBT_TYPES)[number];

export function isPartnerDebt(type: string): type is PartnerDebtDirection {
    return (PARTNER_DEBT_TYPES as readonly string[]).includes(type);
}

export function partnerDebtLabel(
    direction: PartnerDebtDirection,
    partnerName: string,
): string {
    return direction === "partner_debt"
        ? `${partnerName} owes me`
        : `I owe ${partnerName}`;
}

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

/** The figures the feed footer shows (ADR-0018 §1, extended by spec 0007). */
export type FeedTotals = {
    /**
     * Raw card/cash charges — every funding source at full value: you really
     * did charge it (spec 0007 §3.2).
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
     * Income-funded money that went to the partner. The payment-expense part is a
     * BREAKDOWN of `whatIReallySpent`, never an addend — only `legacyPaidToPartner` is.
     */
    paidToPartner: number;
    /**
     * The legacy-movement slice of `paidToPartner` — cash with no consumption row
     * behind it, and the only piece `total` may add.
     */
    legacyPaidToPartner: number;
    /**
     * CONSUMPTION ledger: non-income-funded expenses, payments to the partner
     * included. Transfers stay out — one line summing both ledgers prints $1,360
     * for a $680 dinner she fronted and he later settled (spec 0007 §6a).
     */
    notFromIncome: number;
    /**
     * CASH ledger: savings-funded legacy `gf_paid` movements. Never folded into
     * `notFromIncome` or `total`. Goes to zero once the conversion lands.
     */
    notFromIncomeTransfers: number;
    /** Savings-funded payment-expenses + `notFromIncomeTransfers`. */
    paidToPartnerFromSavings: number;
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
    let charged = 0;
    let whatIReallySpent = 0;
    let setAside = 0;
    let notFromIncome = 0;
    let paidToPartner = 0;
    let savingsFundedPayments = 0;
    const paymentExpenseIds = new Set<string>();
    for (const e of expenses) {
        const isSavingsCategory = e.category.slug === SAVINGS_SLUG;
        // `charged` is source-agnostic on purpose — the card saw the charge
        // whatever money settled it (spec 0007 §3.2, ADR-0020 §6).
        if (!isSavingsCategory) charged += e.amount;
        // Dedup by identity, not by funding: a converted twin is already counted
        // as an expense whichever money funded it.
        if (e.isPartnerPayment) paymentExpenseIds.add(e.id);

        if (e.fundedFrom !== BUDGET_FUNDING_SOURCE) {
            // Another month's money (or a refund). Kept out of BOTH budget
            // figures — including `setAside`, so moving old savings into the
            // Savings category isn't counted as allocating income twice.
            notFromIncome += e.actualExpenditure;
            // Named here too, or the money reaching her hides among every
            // unrelated savings-funded row (BUG-5). A breakdown, not an addend.
            if (e.isPartnerPayment && e.fundedFrom === "savings")
                savingsFundedPayments += e.actualExpenditure;
        } else if (isSavingsCategory) {
            setAside += e.actualExpenditure;
        } else {
            whatIReallySpent += e.actualExpenditure;
            // A breakdown of the line above, never an addend (spec 0007 §6a).
            if (e.isPartnerPayment) paidToPartner += e.actualExpenditure;
        }
    }

    let legacyPaidToPartner = 0;
    let notFromIncomeTransfers = 0;
    for (const m of movements) {
        if (m.type !== "gf_paid") continue;
        if (paymentExpenseIds.has(m.id)) continue;
        // A savings-funded transfer goes to the CASH ledger, never into
        // `notFromIncome` (consumption) — the two are never summed (§6a).
        if (m.fundedFrom === BUDGET_FUNDING_SOURCE)
            legacyPaidToPartner += m.amount;
        else notFromIncomeTransfers += m.amount;
    }

    return {
        charged,
        whatIReallySpent,
        setAside,
        paidToPartner: paidToPartner + legacyPaidToPartner,
        legacyPaidToPartner,
        notFromIncome,
        notFromIncomeTransfers,
        // Same rationale as `legacyPaidToPartner`: an unconverted `gf_paid` is
        // the same economic event, so it reads on this line until CHORE-12.
        paidToPartnerFromSavings:
            savingsFundedPayments + notFromIncomeTransfers,
        total: whatIReallySpent + setAside + legacyPaidToPartner,
    };
}
