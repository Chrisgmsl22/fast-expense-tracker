"use server";

import { z } from "zod";

import { auth } from "@/auth";
import { toFieldErrors } from "@/lib/actions/field-errors";
import type { ActionResult } from "@/lib/actions/result";
import { cdmxCalendarDateToUtc } from "@/lib/dates";
import { PARTNER_NAME } from "@/lib/partner";
import { expenseRepository } from "@/lib/repositories";
import type { ExpenseRepository } from "@/lib/repositories/expense.repository";
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
 * Edit an existing "I owe {partner}" debt (spec 0004). Mirrors `addPartnerDebt`
 * but the write is **scoped by `userId`** (IDOR guard — a mismatch matches zero
 * rows → `not_found`). Re-asserts the debt invariants on every save so an edit
 * can only change the amount/date/category/note, never turn the row into a
 * normal card expense: `paidBy:"gf"`, no card, unshared, full-share, and
 * `actualExpenditure = amount`.
 */
export async function updatePartnerDebt(
    input: unknown,
    repo: ExpenseRepository = expenseRepository,
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
    const description = v.note?.trim() || `I owe ${PARTNER_NAME}`;
    try {
        // Only "I owe {partner}" debts are editable here. Refuse to retype any
        // other owned expense (e.g. a normal card expense) into a gf-debt — the
        // action is the enforcement seam, not just the UI that hides the button.
        const existing = await repo.getById(userId, id);
        if (!existing || existing.paidBy !== "gf") {
            return {
                ok: false,
                code: "not_found",
                message: "Debt not found.",
            };
        }

        const count = await repo.updateForUser(id, userId, {
            categoryId: v.categoryId,
            subcategoryId: null,
            cardId: null,
            date: cdmxCalendarDateToUtc(v.date),
            description,
            amount: v.amount,
            isShared: false,
            yourPercentage: 1,
            // The whole amount is your cost — she fronted it, you owe your share.
            actualExpenditure: v.amount,
            paidBy: "gf",
            notes: null,
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
