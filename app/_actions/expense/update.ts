"use server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { cdmxCalendarDateToUtc } from "@/lib/dates";
import { expenseInputSchema, type ExpenseInput } from "@/lib/schemas/expense";
import type { ActionResult, FieldErrors } from "@/lib/actions/result";

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
 * Update an existing expense for the signed-in user.
 *
 * Mirrors `createExpense`: validates the same shape, recomputes
 * `actualExpenditure` server-side (never trusts a client value), and converts the
 * calendar date to its CDMX-midnight UTC instant. The write is **scoped by
 * `userId`** so a user can never edit a row that isn't theirs — a mismatch
 * matches zero rows and returns `not_found` rather than mutating another user's
 * data (IDOR guard, even though the app is single-user today).
 *
 * `id` rides alongside the expense fields; the Zod object strips it, so it's read
 * separately. `isRecurring` / `originalAmount` / `originalCurrency` are left
 * untouched — they're owned by later phases, not this form.
 */
export async function updateExpense(
    input: unknown,
): Promise<UpdateExpenseResult> {
    const rawId = (input as { id?: unknown })?.id;
    const id = typeof rawId === "string" ? rawId : "";

    const parsed = expenseInputSchema.safeParse(input);
    if (!parsed.success) {
        const fieldErrors: FieldErrors<ExpenseInput> = {};
        for (const issue of parsed.error.issues) {
            const key = issue.path[0];
            if (typeof key === "string") {
                const field = key as keyof ExpenseInput;
                (fieldErrors[field] ??= []).push(issue.message);
            }
        }
        return {
            ok: false,
            code: "validation",
            message: "Invalid expense",
            fieldErrors,
        };
    }
    if (!id) {
        return { ok: false, code: "validation", message: "Invalid expense" };
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
    const actualExpenditure = v.isShared
        ? v.amount * v.yourPercentage
        : v.amount;
    const dateUtc = cdmxCalendarDateToUtc(v.date);

    try {
        if (v.subcategoryId) {
            const sub = await db.subcategory.findUnique({
                where: { id: v.subcategoryId },
                select: { categoryId: true },
            });
            if (!sub || sub.categoryId !== v.categoryId) {
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

        // userId in the where-clause is the ownership guard: a row that isn't the
        // signed-in user's matches nothing, so count stays 0 and we report
        // not_found instead of touching someone else's data.
        const result = await db.expense.updateMany({
            where: { id, userId },
            data: {
                categoryId: v.categoryId,
                subcategoryId: v.subcategoryId ?? null,
                cardId: v.cardId ?? null,
                date: dateUtc,
                description: v.description,
                amount: v.amount,
                isShared: v.isShared,
                yourPercentage: v.yourPercentage,
                actualExpenditure,
                paidBy: v.paidBy,
                notes: v.notes ?? null,
            },
        });
        if (result.count === 0) {
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
