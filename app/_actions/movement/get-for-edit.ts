"use server";

import { auth } from "@/auth";
import type { ActionResult } from "@/lib/actions/result";
import { frozenMovementRefusal } from "@/lib/domain/frozen-row";
import { movementRepository } from "@/lib/repositories";
import type {
    MovementEditable,
    MovementRepository,
} from "@/lib/repositories/movement.repository";

/** `not_found` also covers "not yours". */
export type GetMovementForEditCode =
    | "unauthenticated"
    | "not_found"
    /** A closed settlement cycle counted the row, so it is frozen (spec 0007 §3.5). */
    | "cycle_closed"
    | "db_error";

export type GetMovementForEditResult = ActionResult<
    MovementEditable,
    { id: string },
    GetMovementForEditCode
>;

/**
 * Fetch one movement's editable fields for an edit modal, scoped to the signed-in
 * user. Carries `cardId` and `note`, which the feed rows drop. A frozen row is
 * refused through the helper the update actions use.
 */
export async function getMovementForEdit(
    id: string,
    repo: MovementRepository = movementRepository,
): Promise<GetMovementForEditResult> {
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
        const movement = id ? await repo.getById(userId, id) : null;
        if (!movement) {
            return {
                ok: false,
                code: "not_found",
                message: "Couldn't load that movement. Please refresh.",
            };
        }
        const refusal = frozenMovementRefusal(movement, "edit");
        if (refusal) {
            return { ok: false, code: "cycle_closed", message: refusal };
        }
        return { ok: true, data: movement };
    } catch (e) {
        console.error("getMovementForEdit: db read failed", e);
        return {
            ok: false,
            code: "db_error",
            message: "Couldn't load that movement. Please try again.",
        };
    }
}
