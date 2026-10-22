// The closed-cycle freeze (spec 0007 §3.5): one guard for every edit read and
// write path, so they cannot drift apart.

import { movesSettlementBalance, type SettlementRelevance } from "./expense";
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

/** Frozen = the row's cycle is closed AND that cycle counted the row. */
export function isExpenseFrozen(e: ExpenseCycleFacts): boolean {
    return e.cycleClosedAt !== null && movesSettlementBalance(e);
}

export function isMovementFrozen(m: MovementCycleFacts): boolean {
    return m.cycleClosedAt !== null && movementMovesSettlementBalance(m.type);
}
