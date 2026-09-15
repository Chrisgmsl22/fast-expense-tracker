"use server";

import { z } from "zod";

import { auth } from "@/auth";
import { toFieldErrors } from "@/lib/actions/field-errors";
import type { ActionResult } from "@/lib/actions/result";
import { cdmxCalendarDateToUtc } from "@/lib/dates";
import { partnerPaymentDescription } from "@/lib/domain/expense";
import { resolvePartnerName } from "@/lib/domain/settings";
import { expenseRepository, settingsRepository } from "@/lib/repositories";
import type { ExpenseRepository } from "@/lib/repositories/expense.repository";
import type { SettingsRepository } from "@/lib/repositories/settings.repository";
import {
    partnerPaymentInputSchema,
    type PartnerPaymentInput,
} from "@/lib/schemas/expense";

/** The edit payload carries the row id alongside the debt fields. */
const idSchema = z.object({ id: z.string().min(1) });

/** Failure modes the caller can branch on. `not_found` also covers "not yours". */
export type UpdatePartnerPaymentCode =
    | "validation"
    | "unauthenticated"
    | "not_found"
    | "db_error";

export type UpdatePartnerPaymentResult = ActionResult<
    { id: string },
    PartnerPaymentInput,
    UpdatePartnerPaymentCode
>;

/** Injectable seams — the repositories this action orchestrates. */
export type UpdatePartnerPaymentDeps = {
    expenseRepo: ExpenseRepository;
    settingsRepo: SettingsRepository;
};

/**
 * Edit a debt the partner fronted (spec 0007 §6a). Mirrors `addPartnerPayment`,
 * with the write **scoped by `userId`** (IDOR guard — a mismatch matches zero
 * rows → `not_found`).
 *
 * Only an `isPartnerPayment` expense is editable here: refusing an ordinary one stops a
 * normal purchase being retyped into a debt through this action, which would
 * move the couple balance by a row the user never meant to owe. The action is
 * the enforcement seam, not the UI.
 *
 * Category and subcategory are NOT touched — this form does not offer them, and
 * writing them back from a payload that never carried them would silently undo a
 * choice the user made in the expense form. `isPartnerPayment` is likewise never
 * written: the repository's update shape has no such field.
 */
export async function updatePartnerPayment(
    input: unknown,
    deps: Partial<UpdatePartnerPaymentDeps> = {},
): Promise<UpdatePartnerPaymentResult> {
    const expenseRepo = deps.expenseRepo ?? expenseRepository;
    const settingsRepo = deps.settingsRepo ?? settingsRepository;

    const parsed = partnerPaymentInputSchema.safeParse(input);
    if (!parsed.success) {
        return {
            ok: false,
            code: "validation",
            message: "Invalid debt",
            fieldErrors: toFieldErrors<PartnerPaymentInput>(parsed.error),
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
        const existing = await expenseRepo.getById(userId, id);
        if (!existing || !existing.isPartnerPayment) {
            return { ok: false, code: "not_found", message: "Debt not found." };
        }

        const { partnerName } = await settingsRepo.getSettings(userId);
        const count = await expenseRepo.updateForUser(id, userId, {
            categoryId: existing.categoryId,
            subcategoryId: existing.subcategoryId,
            cardId: null,
            date: cdmxCalendarDateToUtc(v.date),
            description: partnerPaymentDescription(
                v.note,
                resolvePartnerName(partnerName),
            ),
            amount: v.amount,
            // The amount entered is your share, so the two stay equal.
            isShared: false,
            yourPercentage: 1,
            actualExpenditure: v.amount,
            paidBy: "you",
            // Preserved, not cleared: this form has no notes field, and a field
            // it never showed must not be wiped by a save it did not make.
            notes: existing.notes,
        });
        if (count === 0) {
            return { ok: false, code: "not_found", message: "Debt not found." };
        }
        return { ok: true, data: { id } };
    } catch (e) {
        console.error("updatePartnerPayment: db write failed", e);
        return {
            ok: false,
            code: "db_error",
            message: "Could not save the debt. Please try again.",
        };
    }
}
