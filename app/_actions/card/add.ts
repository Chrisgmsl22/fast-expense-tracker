"use server";

import { auth } from "@/auth";
import { toFieldErrors } from "@/lib/actions/field-errors";
import type { ActionResult } from "@/lib/actions/result";
import { MAX_ACTIVE_CARDS } from "@/lib/domain/card";
import { cardRepository } from "@/lib/repositories";
import type { CardRepository } from "@/lib/repositories/card.repository";
import { addCardInputSchema, type AddCardInput } from "@/lib/schemas/card";

/** Failure modes the caller can branch on. */
export type AddCardCode =
    | "validation"
    | "unauthenticated"
    | "limit_reached"
    | "duplicate_name"
    | "db_error";

export type AddCardResult = ActionResult<
    { name: string },
    AddCardInput,
    AddCardCode
>;

/**
 * Add a card (CHORE-6.c). IDOR-safe: the `userId` comes from the session, never
 * the client. Enforces the active-card cap and a unique active name per user
 * (case-insensitive) before writing; archived names don't collide.
 */
export async function addCard(
    input: unknown,
    repo: CardRepository = cardRepository,
): Promise<AddCardResult> {
    const parsed = addCardInputSchema.safeParse(input);
    if (!parsed.success) {
        return {
            ok: false,
            code: "validation",
            message: "Please fix the highlighted fields.",
            fieldErrors: toFieldErrors<AddCardInput>(parsed.error),
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

    try {
        const activeCount = await repo.countActive(userId);
        if (activeCount >= MAX_ACTIVE_CARDS) {
            return {
                ok: false,
                code: "limit_reached",
                message: `You can have at most ${MAX_ACTIVE_CARDS} active cards. Archive one to add another.`,
            };
        }

        const existing = await repo.findActiveByName(userId, parsed.data.name);
        if (existing) {
            return {
                ok: false,
                code: "duplicate_name",
                message: "You already have an active card with that name.",
                fieldErrors: { name: ["A card with that name already exists"] },
            };
        }

        await repo.create(userId, {
            name: parsed.data.name,
            type: parsed.data.type,
            color: parsed.data.color,
        });
        return { ok: true, data: { name: parsed.data.name } };
    } catch (e) {
        console.error("addCard: db write failed", e);
        return {
            ok: false,
            code: "db_error",
            message: "Could not add the card. Please try again.",
        };
    }
}
