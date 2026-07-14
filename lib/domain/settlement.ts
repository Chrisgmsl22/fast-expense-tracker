/**
 * Pure couple-balance domain logic — no DB, no Date, no env, no framework
 * (spec 0004). The service feeds it four pre-summed figures (each already scoped
 * to the current+previous-month window and to the right `paidBy`/movement type),
 * and it returns the signed running balance + its direction + the breakdown the
 * settlement screen renders. Keeping it pure means the balance math is tested
 * without Postgres and never contaminates the spend/consumption totals.
 */

/** The four figures the balance nets, all positive, all in the 2-month window. */
export type SettlementInputs = {
    /** Your partner's 32% share of shared expenses YOU paid — Σ(amount − actualExpenditure). */
    partnerShareOfYourExpenses: number;
    /** Stuff she fronted that you owe her — Σ `gf_fronted` movement amounts (ADR-0020). */
    yourDebtToPartner: number;
    /** Money she's given you — Σ `gf_received` transfers (ADR-0020). */
    moneyPartnerPaidYou: number;
    /** Money you've sent her — Σ `gf_paid`. */
    moneyYouPaidPartner: number;
};

export type SettlementDirection = "she_owes" | "you_owe" | "settled";

export type SettlementBreakdownKey =
    | "partner_share"
    | "your_debt"
    | "partner_paid"
    | "you_paid";

/** One row of "How this balance is made"; the UI supplies the copy per `key`. */
export type SettlementBreakdownLine = {
    key: SettlementBreakdownKey;
    sign: "+" | "-";
    amount: number;
};

export type CoupleBalance = {
    /** Signed, rounded to cents: > 0 she owes you · < 0 you owe her · 0 settled. */
    balance: number;
    /** `Math.abs(balance)` — the figure the hero shows. */
    amount: number;
    direction: SettlementDirection;
    breakdown: SettlementBreakdownLine[];
};

/** `amount` is a Float column, so net the drift out before comparing to 0. */
const roundCents = (n: number): number => Math.round(n * 100) / 100;

/**
 * Net the couple balance (spec 0004 §2.4):
 * `+ partner's share of your expenses − your logged debt − money she paid you
 *  + money you paid her`.
 */
export function computeCoupleBalance(inputs: SettlementInputs): CoupleBalance {
    const balance = roundCents(
        inputs.partnerShareOfYourExpenses -
            inputs.yourDebtToPartner -
            inputs.moneyPartnerPaidYou +
            inputs.moneyYouPaidPartner,
    );
    const direction: SettlementDirection =
        balance > 0 ? "she_owes" : balance < 0 ? "you_owe" : "settled";

    return {
        balance,
        amount: Math.abs(balance),
        direction,
        breakdown: [
            {
                key: "partner_share",
                sign: "+",
                amount: inputs.partnerShareOfYourExpenses,
            },
            { key: "your_debt", sign: "-", amount: inputs.yourDebtToPartner },
            {
                key: "partner_paid",
                sign: "-",
                amount: inputs.moneyPartnerPaidYou,
            },
            { key: "you_paid", sign: "+", amount: inputs.moneyYouPaidPartner },
        ],
    };
}
