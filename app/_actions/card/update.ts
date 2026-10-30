"use server";

import { getTranslations } from "next-intl/server";

import { getSessionUserId } from "@/lib/auth/session";
import { localizeFieldErrors, toFieldErrors } from "@/lib/actions/field-errors";
import type { ActionResult } from "@/lib/actions/result";
import { cardRepository } from "@/lib/repositories";
import type { CardRepository } from "@/lib/repositories/card.repository";
import {
    updateCardInputSchema,
    type UpdateCardInput,
} from "@/lib/schemas/card";
import { cardSchemaMessages } from "./schema-messages";

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
    const t = await getTranslations("settings");
    const parsed = updateCardInputSchema.safeParse(input);
    if (!parsed.success) {
        return {
            ok: false,
            code: "validation",
            message: t("errors.fixFields"),
            fieldErrors: localizeFieldErrors(
                toFieldErrors<UpdateCardInput>(parsed.error),
                await cardSchemaMessages(),
            ),
        };
    }

    const userId = await getSessionUserId();
    if (!userId) {
        return {
            ok: false,
            code: "unauthenticated",
            message: t("errors.unauthenticated"),
        };
    }

    const { id, name, type, color } = parsed.data;

    try {
        if (await repo.isCash(userId, id)) {
            return {
                ok: false,
                code: "cash_locked",
                message: t("cards.errors.cashEdit"),
            };
        }

        const existing = await repo.findActiveByName(userId, name);
        if (existing && existing.id !== id) {
            return {
                ok: false,
                code: "duplicate_name",
                message: t("cards.errors.duplicateName"),
                fieldErrors: { name: [t("cards.errors.duplicateNameField")] },
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
                message: t("cards.errors.notFound"),
            };
        }
        return { ok: true, data: { id } };
    } catch (e) {
        console.error("updateCard: db write failed", e);
        return {
            ok: false,
            code: "db_error",
            message: t("cards.errors.saveFailed"),
        };
    }
}
