"use server";

import { getTranslations } from "next-intl/server";

import { auth } from "@/auth";
import { localizeFieldErrors, toFieldErrors } from "@/lib/actions/field-errors";
import type { ActionResult } from "@/lib/actions/result";
import { MAX_ACTIVE_CARDS } from "@/lib/domain/card";
import { cardRepository } from "@/lib/repositories";
import type { CardRepository } from "@/lib/repositories/card.repository";
import { addCardInputSchema, type AddCardInput } from "@/lib/schemas/card";
import { cardSchemaMessages } from "./schema-messages";

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
 * Add a card. IDOR-safe: the `userId` comes from the session, never
 * the client. Enforces the active-card cap and a unique active name per user
 * (case-insensitive) before writing; archived names don't collide.
 */
export async function addCard(
    input: unknown,
    repo: CardRepository = cardRepository,
): Promise<AddCardResult> {
    const t = await getTranslations("settings");
    const parsed = addCardInputSchema.safeParse(input);
    if (!parsed.success) {
        return {
            ok: false,
            code: "validation",
            message: t("errors.fixFields"),
            fieldErrors: localizeFieldErrors(
                toFieldErrors<AddCardInput>(parsed.error),
                await cardSchemaMessages(),
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

    try {
        const activeCount = await repo.countActive(userId);
        if (activeCount >= MAX_ACTIVE_CARDS) {
            return {
                ok: false,
                code: "limit_reached",
                message: t("cards.errors.limitReached", {
                    max: MAX_ACTIVE_CARDS,
                }),
            };
        }

        const existing = await repo.findActiveByName(userId, parsed.data.name);
        if (existing) {
            return {
                ok: false,
                code: "duplicate_name",
                message: t("cards.errors.duplicateName"),
                fieldErrors: { name: [t("cards.errors.duplicateNameField")] },
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
            message: t("cards.errors.addFailed"),
        };
    }
}
