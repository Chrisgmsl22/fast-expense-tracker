import type {
    CardBalanceState,
    CardBalanceSummary,
    CardPeriodTotals,
    CardStatement,
    WithStatement,
} from "@/lib/domain/card-balance";
import { formatMxn } from "@/lib/format";

/** One card as the Card balances page receives it from the server. */
export type CardBalanceInput = CardPeriodTotals & {
    id: string;
    name: string;
    color: string;
    type: string;
};

export type CardBalanceView = WithStatement<CardBalanceInput>;

export type CardBalancesView = CardBalanceSummary<CardBalanceInput>;

/**
 * The balance state as a headline reads it. `untouched` is the extra case: a
 * zero balance that no payment produced.
 */
export type CardHeadlineState = CardBalanceState | "untouched";

const STATE_LABELS: Record<CardHeadlineState, string> = {
    owed: "Owed",
    paid: "Paid in full",
    credit: "Card owes you",
    untouched: "No activity",
};

/**
 * "Paid in full" claims a payment happened. A card with no opening balance and
 * no rows in the month was never charged, so nothing was ever paid off.
 */
export function headlineState(statement: CardStatement): CardHeadlineState {
    const nothingHappened =
        statement.opening === 0 &&
        statement.charged === 0 &&
        statement.paid === 0 &&
        statement.redeemed === 0;
    return statement.state === "paid" && nothingHappened
        ? "untouched"
        : statement.state;
}

/** With a month, an owed balance reads as the statement's closing line. */
export function stateLabel(
    state: CardHeadlineState,
    monthName?: string,
): string {
    if (monthName) {
        if (state === "owed") return `Owed at end of ${monthName}`;
        if (state === "untouched") return `No activity in ${monthName}`;
    }
    return STATE_LABELS[state];
}

/**
 * Nothing left to pay, by a payment or by overpaying — the green states. A month
 * that never charged the card settled nothing, so it stays grey.
 */
export function isSettled(state: CardHeadlineState): boolean {
    return state === "paid" || state === "credit";
}

export function cardTypeLabel(type: string): string {
    return type.charAt(0).toUpperCase() + type.slice(1);
}

/** "BBVA $6,130.00 + Amex Gold $1,215.60" — the cards that make up the total owed. */
export function owedBreakdown(cards: readonly CardBalanceView[]): string {
    return cards
        .filter((c) => c.state === "owed")
        .map((c) => `${c.name} ${formatMxn(c.balance)}`)
        .join(" + ");
}

export function namesInState(
    cards: readonly CardBalanceView[],
    state: CardBalanceState,
): string {
    return cards
        .filter((c) => c.state === state)
        .map((c) => c.name)
        .join(", ");
}
