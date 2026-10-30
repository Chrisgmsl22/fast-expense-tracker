"use server";

import { getTranslations } from "next-intl/server";

import { getSessionUserId } from "@/lib/auth/session";
import type { ActionResult } from "@/lib/actions/result";
import {
    withRunningBalance,
    type CardHistoryLine,
} from "@/lib/domain/card-balance";
import { cardRepository } from "@/lib/repositories";
import type { CardRepository } from "@/lib/repositories/card.repository";
import {
    cardHistoryInputSchema,
    type CardHistoryInput,
} from "@/lib/schemas/card";

/** Failure modes the caller can branch on. */
export type GetCardHistoryCode =
    | "validation"
    | "unauthenticated"
    | "not_found"
    | "db_error";

export type GetCardHistoryResult = ActionResult<
    { lines: CardHistoryLine[] },
    CardHistoryInput,
    GetCardHistoryCode
>;

export async function getCardHistory(
    input: unknown,
    repo: CardRepository = cardRepository,
): Promise<GetCardHistoryResult> {
    const t = await getTranslations("settings");
    const parsed = cardHistoryInputSchema.safeParse(input);
    if (!parsed.success) {
        return {
            ok: false,
            code: "validation",
            message: t("cards.errors.pickForHistory"),
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

    try {
        const { id, month } = parsed.data;
        const entries = await repo.getHistory(userId, id, month);
        if (!entries) {
            return {
                ok: false,
                code: "not_found",
                message: t("cards.errors.notFound"),
            };
        }
        return { ok: true, data: { lines: withRunningBalance(entries) } };
    } catch (e) {
        console.error("getCardHistory: db read failed", e);
        return {
            ok: false,
            code: "db_error",
            message: t("cards.errors.historyFailed"),
        };
    }
}
