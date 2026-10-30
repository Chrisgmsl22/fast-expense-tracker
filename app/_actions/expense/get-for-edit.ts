"use server";

import { getTranslations } from "next-intl/server";

import { getSessionUserId } from "@/lib/auth/session";
import type { ActionResult } from "@/lib/actions/result";
import { expenseRepository } from "@/lib/repositories";
import type {
    ExpenseEditable,
    ExpenseRepository,
} from "@/lib/repositories/expense.repository";

import { frozenRefusalKey } from "./field-messages";

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
    const t = await getTranslations("expenses");
    const userId = await getSessionUserId();
    if (!userId) {
        return {
            ok: false,
            code: "unauthenticated",
            message: t("errors.unauthenticated"),
        };
    }

    try {
        const expense = id ? await repo.getById(userId, id) : null;
        if (!expense) {
            return {
                ok: false,
                code: "not_found",
                message: t("errors.loadNotFound"),
            };
        }
        const refusal = frozenRefusalKey(expense, "edit");
        if (refusal) {
            return {
                ok: false,
                code: "cycle_closed",
                message: t(`errors.frozen.${refusal}`),
            };
        }
        return { ok: true, data: expense };
    } catch (e) {
        console.error("getExpenseForEdit: db read failed", e);
        return {
            ok: false,
            code: "db_error",
            message: t("errors.loadFailed"),
        };
    }
}
