"use server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import type { ActionResult } from "@/lib/actions/result";

/** `not_found` also covers "not yours" — the row matched no owned expense. */
export type DeleteExpenseCode =
    | "validation"
    | "unauthenticated"
    | "not_found"
    | "db_error";

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
    const rawId = (input as { id?: unknown })?.id;
    const id = typeof rawId === "string" ? rawId : "";
    if (!id) {
        return { ok: false, code: "validation", message: "Missing expense id" };
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
