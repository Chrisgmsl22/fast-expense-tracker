"use server";

import { auth } from "@/auth";
import type { ActionResult } from "@/lib/actions/result";
import { frozenExpenseRefusal } from "@/lib/domain/frozen-row";
import { expenseRepository } from "@/lib/repositories";
import type {
    ExpenseEditable,
    ExpenseRepository,
} from "@/lib/repositories/expense.repository";

/** `not_found` also covers "not yours". */
export type GetExpenseForEditCode =
    | "unauthenticated"
    | "not_found"
    /** A closed settlement cycle counted the row, so it is frozen (spec 0007 §3.5). */
    | "cycle_closed"
    | "db_error";

export type GetExpenseForEditResult = ActionResult<
    ExpenseEditable,
    { id: string },
    GetExpenseForEditCode
>;

/**
 * Fetch one expense's editable fields for the edit modal, scoped to the signed-in
 * user. A frozen row is refused through the helper `updateExpense` uses, so a stale
 * tab never opens a dialog that can only fail on save.
 */
export async function getExpenseForEdit(
    id: string,
    repo: ExpenseRepository = expenseRepository,
): Promise<GetExpenseForEditResult> {
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
        const expense = id ? await repo.getById(userId, id) : null;
        if (!expense) {
            return {
                ok: false,
                code: "not_found",
                message: "Couldn't load that expense. Please refresh.",
            };
        }
        const refusal = frozenExpenseRefusal(expense, "edit");
        if (refusal) {
            return { ok: false, code: "cycle_closed", message: refusal };
        }
        return { ok: true, data: expense };
    } catch (e) {
        console.error("getExpenseForEdit: db read failed", e);
        return {
            ok: false,
            code: "db_error",
            message: "Couldn't load that expense. Please try again.",
        };
    }
}
