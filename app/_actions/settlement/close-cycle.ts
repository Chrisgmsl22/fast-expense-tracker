"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import type { ActionResult } from "@/lib/actions/result";
import { isBalanceSettled } from "@/lib/domain/settlement";
import { settlementRepository } from "@/lib/repositories";
import {
    getSettlement,
    type SettlementDeps,
} from "@/lib/services/settlement/settlement.service";

export type CloseSettlementCycleCode =
    | "unauthenticated"
    | "not_settled"
    | "db_error";

export type CloseSettlementCycleResult = ActionResult<
    {
        /** The transfer now carrying the marker; null when it was already closed. */
        markedMovementId: string | null;
        /** True when this call did nothing because the cycle was already closed. */
        alreadyClosed: boolean;
    },
    Record<string, never>,
    CloseSettlementCycleCode
>;

/**
 * Close the open settlement cycle (spec 0007 §3.5).
 *
 * The server re-derives which transfer carries the marker instead of trusting an
 * id from the client. The boundary it writes is the close INSTANT, so every row
 * counted in the zero balance the user just confirmed falls inside the cycle
 * being closed — including rows entered after that transfer.
 */
export async function closeSettlementCycle(
    deps: Partial<SettlementDeps> = {},
): Promise<CloseSettlementCycleResult> {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
        return {
            ok: false,
            code: "unauthenticated",
            message: "Not authenticated",
        };
    }

    const settlementRepo = deps.settlementRepo ?? settlementRepository;

    try {
        const settlement = await getSettlement(userId, {
            ...deps,
            settlementRepo,
        });

        if (!isBalanceSettled(settlement.balance)) {
            return {
                ok: false,
                code: "not_settled",
                message:
                    "This settlement isn't square yet, so it can't be closed.",
            };
        }

        const movementId = settlement.closableMovementId;
        // No transfer in the open cycle: either nothing has happened since the
        // last close, or a second submit landed after the first one closed it.
        if (!movementId) {
            return {
                ok: true,
                data: { markedMovementId: null, alreadyClosed: true },
            };
        }

        const count = await settlementRepo.markCycleClose(
            userId,
            movementId,
            deps.now ?? new Date(),
        );
        revalidatePath("/settlement");
        return {
            ok: true,
            data: {
                markedMovementId: count > 0 ? movementId : null,
                alreadyClosed: count === 0,
            },
        };
    } catch (e) {
        console.error("closeSettlementCycle: db write failed", e);
        return {
            ok: false,
            code: "db_error",
            message: "Could not close the settlement. Please try again.",
        };
    }
}
