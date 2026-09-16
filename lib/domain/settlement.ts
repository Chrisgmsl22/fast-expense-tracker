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

/**
 * True when nothing is owed either way (net zero). `balance` is already rounded
 * to cents, but a half-cent epsilon keeps this robust against Float drift.
 * Drives the solo-mode Settlement gate: a solo user still reaches
 * the settlement surface while a nonzero balance remains to be wound down.
 */
export function isBalanceSettled(balance: CoupleBalance): boolean {
    return Math.abs(balance.balance) < 0.005;
}

/**
 * The only movement types that may carry the cycle marker (spec 0007 §3.5). A
 * cycle closes when real money squares the balance, so only a transfer can be
 * the closing event — never a card payment, never an "I owe {partner}" debt.
 */
export const CYCLE_CLOSING_TYPES = ["gf_paid", "gf_received"] as const;

export type CycleClosingType = (typeof CYCLE_CLOSING_TYPES)[number];

/** True when this movement type is allowed to carry the cycle marker. */
export function canCloseCycle(type: string): type is CycleClosingType {
    return (CYCLE_CLOSING_TYPES as readonly string[]).includes(type);
}

/**
 * The movement types a settlement cycle COUNTS — the three `inputsFrom` nets:
 * a debt she fronted, money she sent, money you sent (the legacy `gf_paid`).
 * A card payment, an income row or an "other" never touch the balance.
 *
 * This is the movement twin of `movesSettlementBalance`, and it exists for the
 * same reason: a cycle freezes every row it counted, so "counted" must have one
 * definition. Note it is WIDER than `CYCLE_CLOSING_TYPES` — only a transfer can
 * carry the marker, but a debt is just as much inside the cycle, and freezing on
 * the marker column alone left every debt in a filed settlement deletable.
 */
export const SETTLEMENT_MOVEMENT_TYPES = [
    "gf_fronted",
    ...CYCLE_CLOSING_TYPES,
] as const;

export type SettlementMovementType = (typeof SETTLEMENT_MOVEMENT_TYPES)[number];

/** True when a cycle counts this movement type, so a closed cycle freezes it. */
export function movementMovesSettlementBalance(
    type: string,
): type is SettlementMovementType {
    return (SETTLEMENT_MOVEMENT_TYPES as readonly string[]).includes(type);
}

/**
 * The close instant of the cycle a row entered at `enteredAt` belongs to, or
 * null when that cycle is still open (spec 0007 §3.5).
 *
 * Cycles are derived from the sequence of close instants, and each one runs up
 * to and INCLUDING its own close — so the row belongs to the FIRST close at or
 * after it entered. A row entered after the last close has no such marker, which
 * is precisely "still open".
 *
 * It takes the close instants as plain values rather than querying for the
 * nearest one: the boundary (`>=`, not `>`) and the "earliest of those" choice
 * are the whole risk of the closed-cycle freeze, and here they are testable with
 * three Dates instead of a database. `closes` may arrive in any order.
 */
export function cycleCloseAtOrAfter(
    closes: readonly Date[],
    enteredAt: Date,
): Date | null {
    let earliest: Date | null = null;
    for (const close of closes) {
        if (close.getTime() < enteredAt.getTime()) continue;
        if (earliest === null || close.getTime() < earliest.getTime()) {
            earliest = close;
        }
    }
    return earliest;
}
