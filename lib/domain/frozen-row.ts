// The closed-cycle freeze (spec 0007 §3.5): one guard and one set of refusal
// messages for every edit read and write path, so they cannot drift apart.

import { movesSettlementBalance, type SettlementRelevance } from "./expense";
import { isPartnerDebt } from "./movement";
import { movementMovesSettlementBalance } from "./settlement";

export type FrozenAction = "edit" | "delete";

export type ExpenseCycleFacts = SettlementRelevance & {
    cycleClosedAt: Date | null;
};

export type MovementCycleFacts = {
    type: string;
    closedAt: Date | null;
    cycleClosedAt: Date | null;
};

const PAST_TENSE: Record<FrozenAction, string> = {
    edit: "edited",
    delete: "deleted",
};

/** Frozen = the row's cycle is closed AND that cycle counted the row. */
export function isExpenseFrozen(e: ExpenseCycleFacts): boolean {
    return e.cycleClosedAt !== null && movesSettlementBalance(e);
}

export function isMovementFrozen(m: MovementCycleFacts): boolean {
    return m.cycleClosedAt !== null && movementMovesSettlementBalance(m.type);
}

/** The refusal for a frozen expense, or null when nothing freezes it. */
export function frozenExpenseRefusal(
    e: ExpenseCycleFacts,
    action: FrozenAction,
): string | null {
    if (!isExpenseFrozen(e)) return null;
    const done = PAST_TENSE[action];
    return e.isPartnerPayment
        ? `This payment counts in a settlement you already closed, so it can't be ${done}.`
        : `Your partner's share of this expense counts in a settlement you already closed, so it can't be ${done}.`;
}

/** The refusal for a frozen movement, or null when nothing freezes it. */
export function frozenMovementRefusal(
    m: MovementCycleFacts,
    action: FrozenAction,
): string | null {
    if (!isMovementFrozen(m)) return null;
    const done = PAST_TENSE[action];
    if (m.closedAt) {
        return `This transfer closed a settlement and can't be ${done}.`;
    }
    if (action === "delete") {
        return "This row counts in a settlement you already closed, so it can't be deleted.";
    }
    return isPartnerDebt(m.type)
        ? "This debt counts in a settlement you already closed, so it can't be edited."
        : "This transfer counts in a settlement you already closed, so it can't be edited.";
}

/** Ticking "shared" on an unshared row inside a closed cycle would add to a filed balance. */
export const SPLIT_INTO_CLOSED_CYCLE_MESSAGE =
    "This expense sits inside a settlement you already closed, so it can't be split with your partner now — that would change what the settlement settled.";

export const SPLIT_INTO_CLOSED_CYCLE_FIELD_ERROR =
    "The settlement covering this date is already closed";
