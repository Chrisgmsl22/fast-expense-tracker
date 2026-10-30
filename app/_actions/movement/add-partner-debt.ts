"use server";

import { getTranslations } from "next-intl/server";

import { getSessionUserId } from "@/lib/auth/session";
import type { ActionResult } from "@/lib/actions/result";
import { cdmxCalendarDateToUtc } from "@/lib/dates";
import { movementRepository } from "@/lib/repositories";
import type { MovementRepository } from "@/lib/repositories/movement.repository";
import {
    partnerDebtInputSchema,
    type PartnerDebtInput,
} from "@/lib/schemas/movement";
import { translatedFieldErrors } from "./messages";

/** Failure modes the caller can branch on. */
export type AddPartnerDebtCode = "validation" | "unauthenticated" | "db_error";

export type AddPartnerDebtResult = ActionResult<
    { id: string },
    PartnerDebtInput,
    AddPartnerDebtCode
>;

/**
 * Record a settlement-only debt in either direction (spec 0007). Both types have
 * no card or category and never enter expense, income, or budget totals.
 * Omitted direction preserves the original `gf_fronted` (you owe her) behavior.
 */
export async function addPartnerDebt(
    input: unknown,
    repo: MovementRepository = movementRepository,
): Promise<AddPartnerDebtResult> {
    const t = await getTranslations("movements.errors");
    const parsed = partnerDebtInputSchema.safeParse(input);
    if (!parsed.success) {
        return {
            ok: false,
            code: "validation",
            message: t("invalidDebt"),
            fieldErrors: await translatedFieldErrors<PartnerDebtInput>(
                parsed.error,
            ),
        };
    }

    const userId = await getSessionUserId();
    if (!userId) {
        return {
            ok: false,
            code: "unauthenticated",
            message: t("unauthenticated"),
        };
    }

    const v = parsed.data;
    try {
        const created = await repo.insert(userId, {
            date: cdmxCalendarDateToUtc(v.date),
            amount: v.amount,
            type: v.direction ?? "gf_fronted",
            cardId: null,
            note: v.note?.trim() || null,
        });
        return { ok: true, data: { id: created.id } };
    } catch (e) {
        console.error("addPartnerDebt: db write failed", e);
        return {
            ok: false,
            code: "db_error",
            message: t("debtDbError"),
        };
    }
}
