"use server";

import { z } from "zod";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import type { ActionResult } from "@/lib/actions/result";

const idSchema = z.object({ id: z.string().min(1) });

/** `not_found` also covers "not yours" — the row matched no owned expense. */
export type DeleteExpenseCode =
    | "validation"
    | "unauthenticated"
    | "not_found"
    | "db_error";

// ActionResult<TData, TInput, TCode>: TData is the success payload, TInput only
// types the keys for field errors. A delete's input and output are both just the
// id, so the same `{ id: string }` fills both slots — they read alike but mean
// different things.
export type DeleteExpenseResult = ActionResult<
    { id: string },
    { id: string },
    DeleteExpenseCode
>;

/**
 * Delete an expense for the signed-in user. The delete is **scoped
 * by `userId`**: a row that isn't the user's matches nothing and returns
 * `not_found` rather than deleting another user's data (IDOR guard).
 */
export async function deleteExpense(
    input: unknown,
): Promise<DeleteExpenseResult> {
    const parsed = idSchema.safeParse(input);
    if (!parsed.success) {
        return { ok: false, code: "validation", message: "Missing expense id" };
    }
    const { id } = parsed.data;

    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
        return {
            ok: false,
            code: "unauthenticated",
            message: "Not authenticated",
        };
    }

    try {
        const result = await db.expense.deleteMany({ where: { id, userId } });
        if (result.count === 0) {
            return {
                ok: false,
                code: "not_found",
                message: "Expense not found.",
            };
        }
        return { ok: true, data: { id } };
    } catch (e) {
        console.error("deleteExpense: db delete failed", e);
        return {
            ok: false,
            code: "db_error",
            message: "Could not delete the expense. Please try again.",
        };
    }
}
