"use server";

import { z } from "zod";

import { auth } from "@/auth";
import { toFieldErrors } from "@/lib/actions/field-errors";
import type { ActionResult } from "@/lib/actions/result";
import { cdmxCalendarDateToUtc } from "@/lib/dates";
import { movementRepository } from "@/lib/repositories";
import type { MovementRepository } from "@/lib/repositories/movement.repository";
import {
    transferInputSchema,
    type TransferInput,
} from "@/lib/schemas/movement";

/** The edit payload carries the row id alongside the transfer fields. */
const idSchema = z.object({ id: z.string().min(1) });

/** Failure modes the caller can branch on. `not_found` also covers "not yours". */
export type UpdateTransferCode =
    | "validation"
    | "unauthenticated"
    | "not_found"
    | "db_error";

export type UpdateTransferResult = ActionResult<
    { id: string },
    TransferInput,
    UpdateTransferCode
>;

/**
 * Edit an existing cash transfer with the partner (CHORE-5). Mirrors
 * `addTransfer` but the write is **scoped by `userId`** (IDOR guard — a mismatch
 * matches zero rows → `not_found`). `direction` may flip the side (`gf_paid` ↔
 * `gf_received`); only a transfer movement is editable here, so a card payment or
 * debt can't be retyped into a transfer through this action.
 */
export async function updateTransfer(
    input: unknown,
    repo: MovementRepository = movementRepository,
): Promise<UpdateTransferResult> {
    const parsed = transferInputSchema.safeParse(input);
    if (!parsed.success) {
        return {
            ok: false,
            code: "validation",
            message: "Invalid transfer",
            fieldErrors: toFieldErrors<TransferInput>(parsed.error),
        };
    }
    const idParsed = idSchema.safeParse(input);
    if (!idParsed.success) {
        return { ok: false, code: "validation", message: "Invalid transfer" };
    }
    const { id } = idParsed.data;

    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
        return {
            ok: false,
            code: "unauthenticated",
            message: "Not authenticated",
        };
    }

    const v = parsed.data;
    try {
        const existing = await repo.getById(userId, id);
        if (
            !existing ||
            (existing.type !== "gf_paid" && existing.type !== "gf_received")
        ) {
            return {
                ok: false,
                code: "not_found",
                message: "Transfer not found.",
            };
        }

        const count = await repo.updateForUser(id, userId, {
            date: cdmxCalendarDateToUtc(v.date),
            amount: v.amount,
            type: v.direction,
            cardId: null,
            note: v.note?.trim() || null,
        });
        if (count === 0) {
            return {
                ok: false,
                code: "not_found",
                message: "Transfer not found.",
            };
        }
        return { ok: true, data: { id } };
    } catch (e) {
        console.error("updateTransfer: db write failed", e);
        return {
            ok: false,
            code: "db_error",
            message: "Could not save the transfer. Please try again.",
        };
    }
}
