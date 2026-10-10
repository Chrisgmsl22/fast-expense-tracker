import type {
    CardBalanceState,
    CardBalanceSummary,
    CardPeriodTotals,
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

const STATE_LABELS: Record<CardBalanceState, string> = {
    owed: "Owed",
    paid: "Paid in full",
    credit: "Card owes you",
};

/** With a month, an owed balance reads as the statement's closing line. */
export function stateLabel(
    state: CardBalanceState,
    monthName?: string,
): string {
    if (state === "owed" && monthName) return `Owed at end of ${monthName}`;
    return STATE_LABELS[state];
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
