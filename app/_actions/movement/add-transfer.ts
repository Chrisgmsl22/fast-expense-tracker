"use server";

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

/** Failure modes the caller can branch on. */
export type AddTransferCode = "validation" | "unauthenticated" | "db_error";

export type AddTransferResult = ActionResult<
    { id: string },
    TransferInput,
    AddTransferCode
>;

/**
 * Log a cash transfer with the partner — `gf_paid` ("I paid {partner}", money
 * out) or `gf_received` ("{partner} paid me", settling what she owes you), per
 * `input.direction` (ADR-0018 + spec 0004). The net debt you settle, computed in
 * your head; no category, no split. It's cash, never an expense, so it can't
 * distort a category budget or the 68/32 math.
 */
export async function addTransfer(
    input: unknown,
    repo: MovementRepository = movementRepository,
): Promise<AddTransferResult> {
    const parsed = transferInputSchema.safeParse(input);
    if (!parsed.success) {
        return {
            ok: false,
            code: "validation",
            message: "Invalid transfer",
            fieldErrors: toFieldErrors<TransferInput>(parsed.error),
        };
    }

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
        const created = await repo.insert(userId, {
            date: cdmxCalendarDateToUtc(v.date),
            amount: v.amount,
            type: v.direction,
            cardId: null,
            fundedByPartner: false,
            note: v.note ?? null,
        });
        return { ok: true, data: { id: created.id } };
    } catch (e) {
        console.error("addTransfer: db write failed", e);
        return {
            ok: false,
            code: "db_error",
            message: "Could not save the transfer. Please try again.",
        };
    }
}
