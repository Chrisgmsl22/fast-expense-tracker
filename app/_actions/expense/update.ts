"use server";

import { z } from "zod";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { cdmxCalendarDateToUtc } from "@/lib/dates";
import { expenseInputSchema, type ExpenseInput } from "@/lib/schemas/expense";
import type { ActionResult, FieldErrors } from "@/lib/actions/result";

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
 * (validate → recompute `actualExpenditure` server-side → CDMX-midnight date),
 * but the write is **scoped by `userId`** so a mismatch matches zero rows and
 * returns `not_found` instead of mutating another user's data (IDOR guard).
 */
export async function updateExpense(
    input: unknown,
): Promise<UpdateExpenseResult> {
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

        // updateMany (not update) so the where-clause can carry `userId` as well
        // as `id`: Prisma's `update` only accepts unique fields in `where`, so it
        // can't filter by owner — `updateMany` takes an arbitrary filter, making
        // the ownership check atomic with the write. A row that isn't the
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
