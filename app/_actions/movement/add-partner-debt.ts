"use server";

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

/** Failure modes the caller can branch on. */
export type AddPartnerDebtCode = "validation" | "unauthenticated" | "db_error";

export type AddPartnerDebtResult = ActionResult<
    { id: string },
    PartnerDebtInput,
    AddPartnerDebtCode
>;

/**
 * Log an "I owe {partner}" debt — your share of shared things she fronted (spec
 * 0004 §2.2). It's cost, not cash, so it's stored as an `Expense{paidBy:"gf"}`:
 * `actualExpenditure = amount` (all of it is your cost), unshared, in a category
 * so it feeds "What I really spent" + its bucket. The settlement balance reads
 * it as the "you owe her" side; a real `gf_paid` transfer then clears it.
 */
export async function addPartnerDebt(
    input: unknown,
    repo: ExpenseRepository = expenseRepository,
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
    const description = v.note?.trim() || `I owe ${PARTNER_NAME}`;
    try {
        const created = await repo.insert(userId, {
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
