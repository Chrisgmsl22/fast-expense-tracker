"use server";

import { z } from "zod";

import { auth } from "@/auth";
import { toFieldErrors } from "@/lib/actions/field-errors";
import type { ActionResult } from "@/lib/actions/result";
import { cdmxCalendarDateToUtc } from "@/lib/dates";
import {
    movesSettlementBalance,
    partnerPaymentDescription,
} from "@/lib/domain/expense";
import { resolvePartnerName } from "@/lib/domain/settings";
import { expenseRepository, settingsRepository } from "@/lib/repositories";
import type { ExpenseRepository } from "@/lib/repositories/expense.repository";
import type { SettingsRepository } from "@/lib/repositories/settings.repository";
import {
    partnerPaymentInputSchema,
    type PartnerPaymentInput,
} from "@/lib/schemas/expense";

const idSchema = z.object({ id: z.string().min(1) });

/** Failure modes the caller can branch on. `not_found` also covers "not yours". */
export type UpdatePartnerPaymentCode =
    | "validation"
    | "unauthenticated"
    | "not_found"
    /** The row sits in a closed settlement cycle, so it is frozen (spec 0007 §3.5). */
    | "cycle_closed"
    | "db_error";

export type UpdatePartnerPaymentResult = ActionResult<
    { id: string },
    PartnerPaymentInput,
    UpdatePartnerPaymentCode
>;

export type UpdatePartnerPaymentDeps = {
    expenseRepo: ExpenseRepository;
    settingsRepo: SettingsRepository;
};

/**
 * Edit money sent to the partner (spec 0007 §6b). Only an `isPartnerPayment` row
 * is editable here, so an ordinary purchase cannot be retyped into a settlement
 * payment. Category, subcategory and the flag are never written.
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
            message: "Invalid payment",
            fieldErrors: toFieldErrors<PartnerPaymentInput>(parsed.error),
        };
    }
    const idParsed = idSchema.safeParse(input);
    if (!idParsed.success) {
        return { ok: false, code: "validation", message: "Invalid payment" };
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
            return {
                ok: false,
                code: "not_found",
                message: "Payment not found.",
            };
        }
        // Asked through the shared predicate even though a payment always counts, so
        // all three write paths freeze on one definition of "the cycle counted this".
        if (existing.cycleClosedAt && movesSettlementBalance(existing)) {
            return {
                ok: false,
                code: "cycle_closed",
                message:
                    "This payment counts in a settlement you already closed, so it can't be edited.",
            };
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
            // The amount entered is the whole transfer you sent her, and no
            // split is ever applied to it, so the two stay equal (spec 0007 §6b).
            isShared: false,
            yourPercentage: 1,
            actualExpenditure: v.amount,
            paidBy: "you",
            // Re-asserted from the form, so an edit cannot reset a savings-funded
            // payment back to income (spec 0007 §6a decision 5).
            fundedFrom: v.fundedFrom,
            // Preserved, not cleared: this form has no notes field, and a field
            // it never showed must not be wiped by a save it did not make.
            notes: existing.notes,
        });
        if (count === 0) {
            return {
                ok: false,
                code: "not_found",
                message: "Payment not found.",
            };
        }
        return { ok: true, data: { id } };
    } catch (e) {
        console.error("updatePartnerPayment: db write failed", e);
        return {
            ok: false,
            code: "db_error",
            message: "Could not save the payment. Please try again.",
        };
    }
}
