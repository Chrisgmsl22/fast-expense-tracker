"use server";

import { z } from "zod";

import { auth } from "@/auth";
import type { ActionResult } from "@/lib/actions/result";
import { movementMovesSettlementBalance } from "@/lib/domain/settlement";
import { movementRepository } from "@/lib/repositories";
import type { MovementRepository } from "@/lib/repositories/movement.repository";

const idSchema = z.object({ id: z.string().min(1) });

/** `not_found` also covers "not yours" — the row matched no owned movement. */
export type DeleteMovementCode =
    | "validation"
    | "unauthenticated"
    | "not_found"
    /** The row closed a settlement cycle, so it is frozen (spec 0007 §3.5). */
    | "cycle_closed"
    | "db_error";

export type DeleteMovementResult = ActionResult<
    { id: string },
    { id: string },
    DeleteMovementCode
>;

/**
 * Delete a movement for the signed-in user (ADR-0018). Scoped by `userId` — a
 * row that isn't the user's matches nothing and returns `not_found` rather than
 * deleting another user's data (IDOR guard).
 *
 * A row that a **closed settlement cycle counted** is refused, the same way
 * `deleteExpense` refuses one: deleting it restates a settlement the close
 * dialog promised could not be reopened.
 */
export async function deleteMovement(
    input: unknown,
    repo: MovementRepository = movementRepository,
): Promise<DeleteMovementResult> {
    const parsed = idSchema.safeParse(input);
    if (!parsed.success) {
        return {
            ok: false,
            code: "validation",
            message: "Missing movement id",
        };
    }
    const { id } = parsed.data;

    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
        return {
            ok: false,
            code: "unauthenticated",
            message: "Not authenticated",
        };
    }

    try {
        // Read before deleting, exactly as `deleteExpense` does: whether the row
        // is frozen is the server's fact, and a missing row short-circuits here
        // rather than after the attempt.
        const existing = await repo.getById(userId, id);
        if (!existing) {
            return {
                ok: false,
                code: "not_found",
                message: "Movement not found.",
            };
        }
        // Frozen means TWO things: the row's cycle is closed AND that cycle
        // counted the row. Asking only "is this the marker?" (`closedAt`) froze
        // one row per cycle: a debt can never hold the marker — the DB CHECK
        // allows it only on a transfer — so deleting a debt out of a filed
        // settlement succeeded and restated its "You owed {partner}" figure.
        // A card payment moves no balance and stays deletable at any age.
        if (
            existing.cycleClosedAt &&
            movementMovesSettlementBalance(existing.type)
        ) {
            return {
                ok: false,
                code: "cycle_closed",
                message: existing.closedAt
                    ? "This transfer closed a settlement and can't be deleted."
                    : "This row counts in a settlement you already closed, so it can't be deleted.",
            };
        }

        const count = await repo.deleteForUser(userId, id);
        if (count === 0) {
            return {
                ok: false,
                code: "not_found",
                message: "Movement not found.",
            };
        }
        return { ok: true, data: { id } };
    } catch (e) {
        console.error("deleteMovement: db delete failed", e);
        return {
            ok: false,
            code: "db_error",
            message: "Could not delete the movement. Please try again.",
        };
    }
}
