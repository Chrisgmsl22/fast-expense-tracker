"use server";

import { getTranslations } from "next-intl/server";

import { auth } from "@/auth";
import type { ActionResult } from "@/lib/actions/result";
import { cdmxCalendarDateToUtc } from "@/lib/dates";
import { cardRepository, movementRepository } from "@/lib/repositories";
import type { CardRepository } from "@/lib/repositories/card.repository";
import type { MovementRepository } from "@/lib/repositories/movement.repository";
import {
    cardPaymentInputSchema,
    type CardPaymentInput,
} from "@/lib/schemas/movement";
import { translatedFieldErrors } from "./messages";

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
 * expense row and from the partner (ADR-0020: money she sends is a separate
 * `gf_received` transfer, never coupled to a card payment). Never enters spend
 * totals or the settlement balance.
 */
export async function addCardPayment(
    input: unknown,
    repo: MovementRepository = movementRepository,
    cards: CardRepository = cardRepository,
): Promise<AddCardPaymentResult> {
    const t = await getTranslations("movements");
    const parsed = cardPaymentInputSchema.safeParse(input);
    if (!parsed.success) {
        return {
            ok: false,
            code: "validation",
            message: t("errors.invalidCardPayment"),
            fieldErrors: await translatedFieldErrors<CardPaymentInput>(
                parsed.error,
            ),
        };
    }

    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
        return {
            ok: false,
            code: "unauthenticated",
            message: t("errors.unauthenticated"),
        };
    }

    const v = parsed.data;
    try {
        if (!(await cards.findByIdForUser(userId, v.cardId))) {
            return {
                ok: false,
                code: "validation",
                message: t("errors.invalidCardPayment"),
                fieldErrors: { cardId: [t("fieldErrors.cardNotFound")] },
            };
        }

        const created = await repo.insert(userId, {
            date: cdmxCalendarDateToUtc(v.date),
            amount: v.amount,
            type: "card_payment",
            cardId: v.cardId,
            note: v.note ?? null,
        });
        return { ok: true, data: { id: created.id } };
    } catch (e) {
        console.error("addCardPayment: db write failed", e);
        return {
            ok: false,
            code: "db_error",
            message: t("errors.cardPaymentDbError"),
        };
    }
}
