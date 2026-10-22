"use server";

import { getTranslations } from "next-intl/server";

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
    const t = await getTranslations("settings");
    const parsed = cardIdInputSchema.safeParse(input);
    if (!parsed.success) {
        return {
            ok: false,
            code: "validation",
            message: t("cards.errors.pickToRestore"),
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

    const { id } = parsed.data;

    try {
        const card = await repo.findByIdForUser(userId, id);
        if (!card || card.archivedAt === null) {
            return {
                ok: false,
                code: "not_found",
                message: t("cards.errors.archivedNotFound"),
            };
        }

        // Restoring re-activates the card, so it counts against the active cap.
        const activeCount = await repo.countActive(userId);
        if (activeCount >= MAX_ACTIVE_CARDS) {
            return {
                ok: false,
                code: "limit_reached",
                message: t("cards.errors.restoreLimit", {
                    max: MAX_ACTIVE_CARDS,
                }),
            };
        }

        const conflict = await repo.findActiveByName(userId, card.name);
        if (conflict) {
            return {
                ok: false,
                code: "name_conflict",
                message: t("cards.errors.nameConflict", { name: card.name }),
            };
        }

        const count = await repo.restoreForUser(userId, id);
        if (count === 0) {
            return {
                ok: false,
                code: "not_found",
                message: t("cards.errors.archivedNotFound"),
            };
        }
        return { ok: true, data: { id, name: card.name } };
    } catch (e) {
        console.error("restoreCard: db write failed", e);
        return {
            ok: false,
            code: "db_error",
            message: t("cards.errors.restoreFailed"),
        };
    }
}
