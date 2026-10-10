"use server";

import { auth } from "@/auth";
import type { ActionResult } from "@/lib/actions/result";
import {
    cardBalance,
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
    { opening: number; lines: CardHistoryLine[] },
    CardHistoryInput,
    GetCardHistoryCode
>;

/**
 * One card's month: the balance it opened with, then the month's charges and
 * payments, newest first, each with the running balance from that opening.
 */
export async function getCardHistory(
    input: unknown,
    repo: CardRepository = cardRepository,
): Promise<GetCardHistoryResult> {
    const parsed = cardHistoryInputSchema.safeParse(input);
    if (!parsed.success) {
        return {
            ok: false,
            code: "validation",
            message: "Please pick a card and a month.",
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
        const { id, month } = parsed.data;
        const history = await repo.getHistory(userId, id, month);
        if (!history) {
            return {
                ok: false,
                code: "not_found",
                message: "That card no longer exists.",
            };
        }
        const opening = cardBalance(history.before);
        return {
            ok: true,
            data: {
                opening,
                lines: withRunningBalance(history.entries, opening),
            },
        };
    } catch (e) {
        console.error("getCardHistory: db read failed", e);
        return {
            ok: false,
            code: "db_error",
            message: "Could not load the card history. Please try again.",
        };
    }
}
