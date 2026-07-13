"use server";

import { z } from "zod";

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

/** The edit payload carries the row id alongside the debt fields. */
const idSchema = z.object({ id: z.string().min(1) });

/** Failure modes the caller can branch on. `not_found` also covers "not yours". */
export type UpdatePartnerDebtCode =
    | "validation"
    | "unauthenticated"
    | "not_found"
    | "db_error";

export type UpdatePartnerDebtResult = ActionResult<
    { id: string },
    PartnerDebtInput,
    UpdatePartnerDebtCode
>;

/**
 * Edit an existing "I owe {partner}" debt (ADR-0020). Mirrors `addPartnerDebt`
 * but the write is **scoped by `userId`** (IDOR guard — a mismatch matches zero
 * rows → `not_found`). Only a `gf_fronted` movement is editable here: refusing
 * any other type stops a card payment or transfer being retyped into a debt via
 * this action (the action is the enforcement seam, not just the UI).
 */
export async function updatePartnerDebt(
    input: unknown,
    repo: MovementRepository = movementRepository,
): Promise<UpdatePartnerDebtResult> {
    const parsed = partnerDebtInputSchema.safeParse(input);
    if (!parsed.success) {
        return {
            ok: false,
            code: "validation",
            message: "Invalid debt",
            fieldErrors: toFieldErrors<PartnerDebtInput>(parsed.error),
        };
    }
    const idParsed = idSchema.safeParse(input);
    if (!idParsed.success) {
        return { ok: false, code: "validation", message: "Invalid debt" };
    }
    const { id } = idParsed.data;

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
        const existing = await repo.getById(userId, id);
        if (!existing || existing.type !== "gf_fronted") {
            return {
                ok: false,
                code: "not_found",
                message: "Debt not found.",
            };
        }

        const count = await repo.updateForUser(id, userId, {
            date: cdmxCalendarDateToUtc(v.date),
            amount: v.amount,
            type: "gf_fronted",
            cardId: null,
            fundedByPartner: false,
            note: v.note?.trim() || null,
        });
        if (count === 0) {
            return {
                ok: false,
                code: "not_found",
                message: "Debt not found.",
            };
        }
        return { ok: true, data: { id } };
    } catch (e) {
        console.error("updatePartnerDebt: db write failed", e);
        return {
            ok: false,
            code: "db_error",
            message: "Could not save the debt. Please try again.",
        };
    }
}
