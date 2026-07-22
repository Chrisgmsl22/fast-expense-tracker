"use server";

import { auth } from "@/auth";
import { toFieldErrors } from "@/lib/actions/field-errors";
import type { ActionResult } from "@/lib/actions/result";
import { cardRepository } from "@/lib/repositories";
import type { CardRepository } from "@/lib/repositories/card.repository";
import {
    updateCardInputSchema,
    type UpdateCardInput,
} from "@/lib/schemas/card";

/** Failure modes the caller can branch on. */
export type UpdateCardCode =
    | "validation"
    | "unauthenticated"
    | "not_found"
    | "cash_locked"
    | "duplicate_name"
    | "db_error";

export type UpdateCardResult = ActionResult<
    { id: string },
    UpdateCardInput,
    UpdateCardCode
>;

/**
 * Edit a card — rename / recolor / retype (credit⇄debit; never to cash).
 * IDOR-safe: writes are scoped to the session user. The `type:"cash"` card is
 * fully locked (no edit at all). The unique active-name check excludes the
 * card's own id so a pure recolor never trips it.
 */
export async function updateCard(
    input: unknown,
    repo: CardRepository = cardRepository,
): Promise<UpdateCardResult> {
    const parsed = updateCardInputSchema.safeParse(input);
    if (!parsed.success) {
        return {
            ok: false,
            code: "validation",
            message: "Please fix the highlighted fields.",
            fieldErrors: toFieldErrors<UpdateCardInput>(parsed.error),
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

    const { id, name, type, color } = parsed.data;

    try {
        if (await repo.isCash(userId, id)) {
            return {
                ok: false,
                code: "cash_locked",
                message: "The Cash card can't be edited.",
            };
        }

        const existing = await repo.findActiveByName(userId, name);
        if (existing && existing.id !== id) {
            return {
                ok: false,
                code: "duplicate_name",
                message: "You already have an active card with that name.",
                fieldErrors: { name: ["A card with that name already exists"] },
            };
        }

        const count = await repo.updateForUser(userId, id, {
            name,
            type,
            color,
        });
        if (count === 0) {
            return {
                ok: false,
                code: "not_found",
                message: "That card no longer exists.",
            };
        }
        return { ok: true, data: { id } };
    } catch (e) {
        console.error("updateCard: db write failed", e);
        return {
            ok: false,
            code: "db_error",
            message: "Could not save the card. Please try again.",
        };
    }
}
