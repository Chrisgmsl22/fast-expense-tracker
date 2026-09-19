"use server";

import { auth } from "@/auth";
import { toFieldErrors } from "@/lib/actions/field-errors";
import type { ActionResult } from "@/lib/actions/result";
import { cdmxCalendarDateToUtc } from "@/lib/dates";
import { movementRepository } from "@/lib/repositories";
import type { MovementRepository } from "@/lib/repositories/movement.repository";
import {
    partnerDebtInputSchema,
    type PartnerDebtInput,
} from "@/lib/schemas/movement";

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
    const parsed = partnerDebtInputSchema.safeParse(input);
    if (!parsed.success) {
        return {
            ok: false,
            code: "validation",
            message: "Invalid debt",
            fieldErrors: toFieldErrors<PartnerDebtInput>(parsed.error),
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
            message: "Could not save the debt. Please try again.",
        };
    }
}
