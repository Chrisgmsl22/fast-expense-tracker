"use server";

import { z } from "zod";

import { auth } from "@/auth";
import { toFieldErrors } from "@/lib/actions/field-errors";
import type { ActionResult } from "@/lib/actions/result";
import { cdmxCalendarDateToUtc } from "@/lib/dates";
import { movementRepository } from "@/lib/repositories";
import type { MovementRepository } from "@/lib/repositories/movement.repository";
import {
    cardPaymentInputSchema,
    type CardPaymentInput,
} from "@/lib/schemas/movement";

/** The edit payload carries the row id alongside the card-payment fields. */
const idSchema = z.object({ id: z.string().min(1) });

/** Failure modes the caller can branch on. `not_found` also covers "not yours". */
export type UpdateCardPaymentCode =
    | "validation"
    | "unauthenticated"
    | "not_found"
    | "db_error";

export type UpdateCardPaymentResult = ActionResult<
    { id: string },
    CardPaymentInput,
    UpdateCardPaymentCode
>;

/**
 * Edit an existing card payment (CHORE-5). Mirrors `addCardPayment` but the write
 * is **scoped by `userId`** (IDOR guard — a mismatch matches zero rows →
 * `not_found`). Only a `card_payment` movement is editable here: refusing any
 * other type stops a transfer or debt being retyped into a card payment through
 * this action (the action is the enforcement seam, not just the UI).
 */
export async function updateCardPayment(
    input: unknown,
    repo: MovementRepository = movementRepository,
): Promise<UpdateCardPaymentResult> {
    const parsed = cardPaymentInputSchema.safeParse(input);
    if (!parsed.success) {
        return {
            ok: false,
            code: "validation",
            message: "Invalid card payment",
            fieldErrors: toFieldErrors<CardPaymentInput>(parsed.error),
        };
    }
    const idParsed = idSchema.safeParse(input);
    if (!idParsed.success) {
        return {
            ok: false,
            code: "validation",
            message: "Invalid card payment",
        };
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
        if (!existing || existing.type !== "card_payment") {
            return {
                ok: false,
                code: "not_found",
                message: "Card payment not found.",
            };
        }

        const count = await repo.updateForUser(id, userId, {
            date: cdmxCalendarDateToUtc(v.date),
            amount: v.amount,
            type: "card_payment",
            cardId: v.cardId,
            note: v.note?.trim() || null,
        });
        if (count === 0) {
            return {
                ok: false,
                code: "not_found",
                message: "Card payment not found.",
            };
        }
        return { ok: true, data: { id } };
    } catch (e) {
        console.error("updateCardPayment: db write failed", e);
        return {
            ok: false,
            code: "db_error",
            message: "Could not save the card payment. Please try again.",
        };
    }
}
