"use server";

import { z } from "zod";

import { auth } from "@/auth";
import { toFieldErrors } from "@/lib/actions/field-errors";
import type { ActionResult } from "@/lib/actions/result";
import { cdmxCalendarDateToUtc } from "@/lib/dates";
import { computeActualExpenditure } from "@/lib/domain/expense";
import { expenseRepository } from "@/lib/repositories";
import { expenseInputSchema, type ExpenseInput } from "@/lib/schemas/expense";

/** The edit payload carries the row id alongside the expense fields. */
const idSchema = z.object({ id: z.string().min(1) });

/** Failure modes the caller can branch on. `not_found` also covers "not yours". */
export type UpdateExpenseCode =
    | "validation"
    | "unauthenticated"
    | "not_found"
    | "db_error";

export type UpdateExpenseResult = ActionResult<
    { id: string },
    ExpenseInput,
    UpdateExpenseCode
>;

/**
 * Update an existing expense for the signed-in user. Mirrors `createExpense`
 * (validate → recompute server-side → persist), but the write is **scoped by
 * `userId`** in the service so a mismatch matches zero rows and returns
 * `not_found` instead of mutating another user's data (IDOR guard).
 */
export async function updateExpense(
    input: unknown,
): Promise<UpdateExpenseResult> {
    const parsed = expenseInputSchema.safeParse(input);
    if (!parsed.success) {
        return {
            ok: false,
            code: "validation",
            message: "Invalid expense",
            fieldErrors: toFieldErrors<ExpenseInput>(parsed.error),
        };
    }
    // Validate the id through Zod too, rather than hand-casting `input` — the
    // action's argument is `unknown` precisely so nothing is read untyped.
    const idParsed = idSchema.safeParse(input);
    if (!idParsed.success) {
        return { ok: false, code: "validation", message: "Invalid expense" };
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
        if (v.subcategoryId) {
            const categoryId = await expenseRepository.getSubcategoryCategoryId(
                v.subcategoryId,
            );
            if (categoryId !== v.categoryId) {
                return {
                    ok: false,
                    code: "validation",
                    message: "Invalid expense",
                    fieldErrors: {
                        subcategoryId: [
                            "Subcategory doesn't belong to the selected category",
                        ],
                    },
                };
            }
        }

        const count = await expenseRepository.updateForUser(id, userId, {
            categoryId: v.categoryId,
            subcategoryId: v.subcategoryId ?? null,
            cardId: v.cardId ?? null,
            date: cdmxCalendarDateToUtc(v.date),
            description: v.description,
            amount: v.amount,
            isShared: v.isShared,
            yourPercentage: v.yourPercentage,
            actualExpenditure: computeActualExpenditure(v),
            paidBy: v.paidBy,
            notes: v.notes ?? null,
        });
        if (count === 0) {
            return {
                ok: false,
                code: "not_found",
                message: "Expense not found.",
            };
        }
        return { ok: true, data: { id } };
    } catch (e) {
        console.error("updateExpense: db write failed", e);
        return {
            ok: false,
            code: "db_error",
            message: "Could not save changes. Please try again.",
        };
    }
}
