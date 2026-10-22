"use server";

import { getTranslations } from "next-intl/server";

import { auth } from "@/auth";
import type { ActionResult } from "@/lib/actions/result";
import { cardRepository } from "@/lib/repositories";
import type { CardRepository } from "@/lib/repositories/card.repository";
import { cardIdInputSchema, type CardIdInput } from "@/lib/schemas/card";

/** Failure modes the caller can branch on. */
export type DeleteCardCode =
    | "validation"
    | "unauthenticated"
    | "not_found"
    | "cash_locked"
    | "has_references"
    | "db_error";

export type DeleteCardResult = ActionResult<
    { id: string },
    CardIdInput,
    DeleteCardCode
>;

/**
 * Hard-delete a card — only allowed for a card with zero
 * Expense/Movement references (added by mistake, never used). References are
 * re-checked server-side, so the client can never force a delete that would
 * strip the card label off history; used cards must be archived instead.
 * IDOR-safe and cash-locked.
 */
export async function deleteCard(
    input: unknown,
    repo: CardRepository = cardRepository,
): Promise<DeleteCardResult> {
    const t = await getTranslations("settings");
    const parsed = cardIdInputSchema.safeParse(input);
    if (!parsed.success) {
        return {
            ok: false,
            code: "validation",
            message: t("cards.errors.pickToDelete"),
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
        if (await repo.isCash(userId, id)) {
            return {
                ok: false,
                code: "cash_locked",
                message: t("cards.errors.cashDelete"),
            };
        }

        // Re-check references server-side — never trust the client. A referenced
        // card must be archived (keeps history), not deleted.
        if ((await repo.referenceCount(userId, id)) > 0) {
            return {
                ok: false,
                code: "has_references",
                message: t("cards.errors.hasReferences"),
            };
        }

        const count = await repo.deleteForUser(userId, id);
        if (count === 0) {
            return {
                ok: false,
                code: "not_found",
                message: t("cards.errors.notFound"),
            };
        }
        return { ok: true, data: { id } };
    } catch (e) {
        console.error("deleteCard: db write failed", e);
        return {
            ok: false,
            code: "db_error",
            message: t("cards.errors.deleteFailed"),
        };
    }
}
