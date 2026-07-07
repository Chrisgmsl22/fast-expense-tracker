"use server";

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

/** Failure modes the caller can branch on. */
export type AddCardPaymentCode = "validation" | "unauthenticated" | "db_error";

export type AddCardPaymentResult = ActionResult<
    { id: string },
    CardPaymentInput,
    AddCardPaymentCode
>;

/**
 * Log a card payment for the signed-in user (ADR-0018).
 *
 * A `card_payment` movement — real money moving to a card, decoupled from any
 * expense row. `fundedByPartner` marks that the payment used money the partner
 * sent (draws down the "partner owes you" reminder). Never enters spend totals.
 */
export async function addCardPayment(
    input: unknown,
    repo: MovementRepository = movementRepository,
): Promise<AddCardPaymentResult> {
    const parsed = cardPaymentInputSchema.safeParse(input);
    if (!parsed.success) {
        return {
            ok: false,
            code: "validation",
            message: "Invalid card payment",
            fieldErrors: toFieldErrors<CardPaymentInput>(parsed.error),
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
            type: "card_payment",
            cardId: v.cardId,
            fundedByPartner: v.fundedByPartner,
            note: v.note ?? null,
        });
        return { ok: true, data: { id: created.id } };
    } catch (e) {
        console.error("addCardPayment: db write failed", e);
        return {
            ok: false,
            code: "db_error",
            message: "Could not save the card payment. Please try again.",
        };
    }
}
