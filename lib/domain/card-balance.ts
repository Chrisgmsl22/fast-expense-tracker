/** Every sum runs in whole centavos so Float columns never drift. */

/** A card's sums over some dates. `charged` is the full `Expense.amount`, never a split share. */
export type CardTotals = {
    charged: number;
    paid: number;
    redeemed: number;
};

/** owed: you owe the card · paid: nothing either way · credit: the card owes you. */
export type CardBalanceState = "owed" | "paid" | "credit";

/** Cash and debit spend money you already hold, so they never owe a balance. */
export const NO_BALANCE_CARD_TYPES = ["cash", "debit"] as const;

const toCents = (n: number): number => Math.round(n * 100);
const fromCents = (cents: number): number => cents / 100;

/** Charged − paid − redeemed. Positive = owed, negative = the card owes you. */
export function cardBalance({ charged, paid, redeemed }: CardTotals): number {
    return fromCents(toCents(charged) - toCents(paid) - toCents(redeemed));
}

export function balanceState(balance: number): CardBalanceState {
    const cents = toCents(balance);
    if (cents > 0) return "owed";
    if (cents < 0) return "credit";
    return "paid";
}

/** What you owe across cards. A card that owes you never offsets another card's debt. */
export function totalOwed(balances: readonly number[]): number {
    return fromCents(
        balances.reduce((sum, b) => sum + Math.max(toCents(b), 0), 0),
    );
}

/** What cards owe you across overpaid cards, as a positive figure. */
export function totalCredit(balances: readonly number[]): number {
    return fromCents(
        balances.reduce((sum, b) => sum - Math.min(toCents(b), 0), 0),
    );
}

/**
 * One month on its own: charged − paid − redeemed = balance. Nothing carries in
 * from an earlier month, so an unpaid amount stays in the month it was charged.
 */
export type CardStatement = CardTotals & {
    balance: number;
    state: CardBalanceState;
};

export function cardStatement(totals: CardTotals): CardStatement {
    const balance = cardBalance(totals);
    return {
        charged: fromCents(toCents(totals.charged)),
        paid: fromCents(toCents(totals.paid)),
        redeemed: fromCents(toCents(totals.redeemed)),
        balance,
        state: balanceState(balance),
    };
}

/** No charge, payment or redemption in the month, so the balance is 0 too. */
export function isQuietCard({ charged, paid, redeemed }: CardTotals): boolean {
    return (
        toCents(charged) === 0 && toCents(paid) === 0 && toCents(redeemed) === 0
    );
}

/**
 * Cards with activity first, quiet cards after them. Each group keeps the order
 * it arrived in, so the repository's A→Z stays the one ordering.
 */
export function quietCardsLast<T extends CardTotals>(cards: readonly T[]): T[] {
    return [
        ...cards.filter((c) => !isQuietCard(c)),
        ...cards.filter(isQuietCard),
    ];
}

export type WithStatement<T> = Omit<T, keyof CardStatement> & CardStatement;

export type CardBalanceSummary<T> = {
    cards: WithStatement<T>[];
    totalOwed: number;
    totalCredit: number;
};

/** Each card's month statement, quiet cards last, plus what is owed either way. */
export function summarizeCardBalances<T extends CardTotals>(
    cards: readonly T[],
): CardBalanceSummary<T> {
    const statements: WithStatement<T>[] = quietCardsLast(
        cards.map((card) => ({ ...card, ...cardStatement(card) })),
    );
    const balances = statements.map((c) => c.balance);
    return {
        cards: statements,
        totalOwed: totalOwed(balances),
        totalCredit: totalCredit(balances),
    };
}

/** The amount "Pay full" fills in, or null when nothing is owed. */
export function payFullAmount(balance: number): number | null {
    return balanceState(balance) === "owed" ? balance : null;
}

/** The balance after a payment of `amount`; null while the amount is not a number. */
export function balanceAfterPayment(
    balance: number,
    amount: number,
): number | null {
    if (!Number.isFinite(amount)) return null;
    return fromCents(toCents(balance) - toCents(amount));
}

export type CardHistoryKind = "charge" | "payment";

/** `detail` is a charge's category, or a payment's note. */
export type CardHistoryEntry = {
    id: string;
    kind: CardHistoryKind;
    date: Date;
    createdAt: Date;
    description: string | null;
    detail: string | null;
    isShared: boolean;
    amount: number;
};

export type CardHistoryLine = CardHistoryEntry & {
    signedAmount: number;
    balanceAfter: number;
};

const signOf = (kind: CardHistoryKind): number => (kind === "charge" ? 1 : -1);

function chronological(a: CardHistoryEntry, b: CardHistoryEntry): number {
    return (
        a.date.getTime() - b.date.getTime() ||
        a.createdAt.getTime() - b.createdAt.getTime() ||
        a.id.localeCompare(b.id)
    );
}

/** Built oldest first from 0, then reversed. */
export function withRunningBalance(
    entries: readonly CardHistoryEntry[],
): CardHistoryLine[] {
    let runningCents = 0;
    return [...entries]
        .sort(chronological)
        .map((entry) => {
            const signedCents = signOf(entry.kind) * toCents(entry.amount);
            runningCents += signedCents;
            return {
                ...entry,
                signedAmount: fromCents(signedCents),
                balanceAfter: fromCents(runningCents),
            };
        })
        .reverse();
}
