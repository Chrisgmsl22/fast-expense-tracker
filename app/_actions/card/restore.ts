"use server";

import { auth } from "@/auth";
import type { ActionResult } from "@/lib/actions/result";
import { MAX_ACTIVE_CARDS } from "@/lib/domain/card";
import { cardRepository } from "@/lib/repositories";
import type { CardRepository } from "@/lib/repositories/card.repository";
import { cardIdInputSchema, type CardIdInput } from "@/lib/schemas/card";

/** Failure modes the caller can branch on. */
export type RestoreCardCode =
    | "validation"
    | "unauthenticated"
    | "not_found"
    | "limit_reached"
    | "name_conflict"
    | "db_error";

export type RestoreCardResult = ActionResult<
    { id: string; name: string },
    CardIdInput,
    RestoreCardCode
>;

/**
 * Restore (unarchive) a card — the inverse of archive. IDOR-safe. Blocks when an
 * active card already holds the archived card's name (case-insensitive): two
 * active cards can't share a name, so the user must rename/archive the conflicting
 * one first. `findActiveByName` only returns active cards, so the archived card
 * being restored never matches itself.
 */
export async function restoreCard(
    input: unknown,
    repo: CardRepository = cardRepository,
): Promise<RestoreCardResult> {
    const parsed = cardIdInputSchema.safeParse(input);
    if (!parsed.success) {
        return {
            ok: false,
            code: "validation",
            message: "Please pick a card to restore.",
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

    const { id } = parsed.data;

    try {
        const card = await repo.findByIdForUser(userId, id);
        if (!card || card.archivedAt === null) {
            return {
                ok: false,
                code: "not_found",
                message: "That archived card no longer exists.",
            };
        }

        // Restoring re-activates the card, so it counts against the active cap.
        const activeCount = await repo.countActive(userId);
        if (activeCount >= MAX_ACTIVE_CARDS) {
            return {
                ok: false,
                code: "limit_reached",
                message: `You're at the ${MAX_ACTIVE_CARDS}-card limit — archive or delete an active card first.`,
            };
        }

        const conflict = await repo.findActiveByName(userId, card.name);
        if (conflict) {
            return {
                ok: false,
                code: "name_conflict",
                message: `You already have an active card named "${card.name}" — rename or archive that one first.`,
            };
        }

        const count = await repo.restoreForUser(userId, id);
        if (count === 0) {
            return {
                ok: false,
                code: "not_found",
                message: "That archived card no longer exists.",
            };
        }
        return { ok: true, data: { id, name: card.name } };
    } catch (e) {
        console.error("restoreCard: db write failed", e);
        return {
            ok: false,
            code: "db_error",
            message: "Could not restore the card. Please try again.",
        };
    }
}
