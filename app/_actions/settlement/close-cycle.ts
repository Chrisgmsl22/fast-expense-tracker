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
     * Square, but nothing in the open cycle can carry the boundary: `closedAt` lives
     * on `Movement`, and a cycle settled only by a payment-expense has no movement
     * to mark (spec 0007 §6b).
     */
    | "no_marker"
    /**
     * The transfer the close would have marked was deleted between the read that
     * picked it and the write that would mark it. It matches zero rows, exactly as a
     * double submit does — but here nothing was closed.
     */
    | "marker_gone"
    | "db_error";

export type CloseSettlementCycleResult = ActionResult<
    {
        /** The transfer now carrying the marker; null when it was already closed. */
        markedMovementId: string | null;
        alreadyClosed: boolean;
    },
    Record<string, never>,
    CloseSettlementCycleCode
>;

/**
 * Close the open settlement cycle (spec 0007 §3.5). The server re-derives the
 * marker instead of trusting a client id, and writes the close INSTANT, so every
 * row counted in the zero balance falls inside the cycle being closed.
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
            // A cycle with rows but no markable movement is NOT closed — answering "ok"
            // would report success for work not done.
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
            // Zero rows affected has two opposite causes: the row is already a marker (a
            // double submit), or it was deleted since the read. Only the first leaves a
            // marker behind, so ask which.
            const markers = await settlementRepo.getCycleMarkers(userId);
            if (!markers.some((m) => m.id === movementId)) {
                // The page is showing a transfer that is gone, so refresh here rather than
                // leave a stale journal behind our own "refresh" advice.
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
