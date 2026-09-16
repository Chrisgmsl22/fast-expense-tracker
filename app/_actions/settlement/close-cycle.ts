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
    /**
     * Square, but nothing in the open cycle can carry the boundary: `closedAt`
     * lives on `Movement`, and a cycle settled only by a payment-expense has no
     * movement to mark (spec 0007 §6b). Reported rather than swallowed — this
     * used to answer `ok:true`, a success for work not done.
     */
    | "no_marker"
    /**
     * The transfer the close would have marked is no longer there — deleted
     * between the read that picked it and the write that would mark it. The
     * write matches zero rows, exactly as a double submit does, and the two used
     * to be reported alike: `alreadyClosed`. They are opposite outcomes. One
     * cycle is filed; the other never closed and the user was told it had.
     */
    | "marker_gone"
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
        if (!movementId) {
            // An EMPTY cycle really is already closed — a second submit lands
            // here after the first one marked it.
            if (settlement.journal.length === 0) {
                return {
                    ok: true,
                    data: { markedMovementId: null, alreadyClosed: true },
                };
            }
            // A cycle with rows but no markable movement is NOT closed. Saying
            // "ok" for it reports success for work not done — the failure mode
            // this repo keeps shipping. See the `no_marker` code.
            return {
                ok: false,
                code: "no_marker",
                message:
                    "This settlement can't be closed yet: closing marks a transfer " +
                    "with your partner, and this one holds none.",
            };
        }

        const count = await settlementRepo.markCycleClose(
            userId,
            movementId,
            deps.now ?? new Date(),
        );

        if (count === 0) {
            // `markCycleClose` matches nothing for two very different reasons:
            // the row is already a marker (a double submit — harmless), or the
            // row is GONE, deleted between the read above and this write. Ask
            // which: a marker for it exists only in the first case.
            const markers = await settlementRepo.getCycleMarkers(userId);
            if (!markers.some((m) => m.id === movementId)) {
                // Do the refresh the message asks for: the page is showing a
                // transfer that is gone, so leaving the reload to the user keeps
                // a stale journal on screen behind our own "refresh" advice.
                revalidatePath("/settlement");
                return {
                    ok: false,
                    code: "marker_gone",
                    message:
                        "The transfer that would close this settlement is no longer there. " +
                        "Refresh the page and try again.",
                };
            }
            revalidatePath("/settlement");
            return {
                ok: true,
                data: { markedMovementId: null, alreadyClosed: true },
            };
        }

        revalidatePath("/settlement");
        return {
            ok: true,
            data: { markedMovementId: movementId, alreadyClosed: false },
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
