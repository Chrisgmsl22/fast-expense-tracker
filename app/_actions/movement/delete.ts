"use server";

import { z } from "zod";

import { auth } from "@/auth";
import type { ActionResult } from "@/lib/actions/result";
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
 * deleting another user's data (IDOR guard). No edit UI ships this slice; a
 * mistaken movement is fixed by delete + re-add.
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
        const count = await repo.deleteForUser(userId, id);
        if (count === 0) {
            // The delete where-clause excludes cycle markers, so a zero count
            // means either "not yours / gone" or "frozen". Tell them apart, so
            // a frozen row never reads as a missing one.
            const existing = await repo.getById(userId, id);
            if (existing?.closedAt) {
                return {
                    ok: false,
                    code: "cycle_closed",
                    message:
                        "This transfer closed a settlement and can't be deleted.",
                };
            }
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
