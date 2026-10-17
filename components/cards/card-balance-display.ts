import {
    isQuietCard,
    type CardBalanceState,
    type CardBalanceSummary,
    type CardStatement,
    type CardTotals,
    type WithStatement,
} from "@/lib/domain/card-balance";
import { formatMxn } from "@/lib/format";

/** One card as the Card balances page receives it from the server. */
export type CardBalanceInput = CardTotals & {
    id: string;
    name: string;
    color: string;
    type: string;
};

export type CardBalanceView = WithStatement<CardBalanceInput>;

export type CardBalancesView = CardBalanceSummary<CardBalanceInput>;

/**
 * The balance state as a headline reads it. `untouched` is the extra case: a
 * quiet card, with no charge or payment in the month.
 */
export type CardHeadlineState = CardBalanceState | "untouched";

const STATE_LABELS: Record<CardHeadlineState, string> = {
    owed: "Owed",
    paid: "Paid in full",
    credit: "Paid more than charged",
    untouched: "No activity",
};

/**
 * "Paid in full" claims a payment happened. A card with no rows in the month
 * was never charged, so nothing was ever paid off.
 */
export function headlineState(statement: CardStatement): CardHeadlineState {
    return isQuietCard(statement) ? "untouched" : statement.state;
}

/** With a month, the label names the statement it belongs to. */
export function stateLabel(
    state: CardHeadlineState,
    monthName?: string,
): string {
    if (monthName) {
        if (state === "owed") return `Owed for ${monthName}`;
        if (state === "credit") return `Paid more than charged in ${monthName}`;
        if (state === "untouched") return `No activity in ${monthName}`;
    }
    return STATE_LABELS[state];
}

/**
 * The month's charges paid exactly: the one green state. Paying more than the
 * month charged usually means an earlier month's bill was paid, so it stays
 * neutral, and a month that never charged the card settled nothing.
 */
export function isSettled(state: CardHeadlineState): boolean {
    return state === "paid";
}

/** The line under a balance that is not owed, or null when the label says it all. */
export function balanceFootnote(
    card: CardStatement,
    monthName: string,
    state: CardHeadlineState,
): string | null {
    if (state === "paid") return `Nothing owed for ${monthName}`;
    if (state === "credit")
        return `You paid ${formatMxn(Math.abs(card.balance))} more than you charged in ${monthName}.`;
    return null;
}

export function cardTypeLabel(type: string): string {
    return type.charAt(0).toUpperCase() + type.slice(1);
}

/**
 * "BBVA $6,130.00 + Amex Gold $1,215.60": the cards in `state`, each with its
 * amount as a positive figure.
 */
export function breakdownInState(
    cards: readonly CardBalanceView[],
    state: CardBalanceState,
): string {
    return cards
        .filter((c) => c.state === state)
        .map((c) => `${c.name} ${formatMxn(Math.abs(c.balance))}`)
        .join(" + ");
}
