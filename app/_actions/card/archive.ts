"use server";

import { auth } from "@/auth";
import type { ActionResult } from "@/lib/actions/result";
import { cardRepository } from "@/lib/repositories";
import type { CardRepository } from "@/lib/repositories/card.repository";
import { cardIdInputSchema, type CardIdInput } from "@/lib/schemas/card";

/** Failure modes the caller can branch on. */
export type ArchiveCardCode =
    | "validation"
    | "unauthenticated"
    | "not_found"
    | "cash_locked"
    | "db_error";

export type ArchiveCardResult = ActionResult<
    { id: string },
    CardIdInput,
    ArchiveCardCode
>;

/**
 * Archive a card — the removal path for a card with history: it drops
 * out of pickers but stays attached to past expenses/movements. IDOR-safe and
 * cash-locked. Delete (for unused cards) is a separate action.
 */
export async function archiveCard(
    input: unknown,
    repo: CardRepository = cardRepository,
): Promise<ArchiveCardResult> {
    const parsed = cardIdInputSchema.safeParse(input);
    if (!parsed.success) {
        return {
            ok: false,
            code: "validation",
            message: "Please pick a card to archive.",
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
        if (await repo.isCash(userId, id)) {
            return {
                ok: false,
                code: "cash_locked",
                message: "The Cash card can't be archived.",
            };
        }

        const count = await repo.archiveForUser(userId, id);
        if (count === 0) {
            return {
                ok: false,
                code: "not_found",
                message: "That card no longer exists.",
            };
        }
        return { ok: true, data: { id } };
    } catch (e) {
        console.error("archiveCard: db write failed", e);
        return {
            ok: false,
            code: "db_error",
            message: "Could not archive the card. Please try again.",
        };
    }
}
