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
 * Log an "I owe {partner}" debt — something she fronted that you owe her back
 * (ADR-0020). It's settlement-only, not consumption, so it's stored as a
 * `Movement{type:"gf_fronted"}` (no card, no category): it never enters
 * expenses, categories, the budget, or spend-by-card. The settlement balance
 * reads it as the "you owe her" side; a real `gf_paid` transfer then clears it.
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
            type: "gf_fronted",
            cardId: null,
            fundedByPartner: false,
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
