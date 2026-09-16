"use server";

import { z } from "zod";

import { auth } from "@/auth";
import type { ActionResult } from "@/lib/actions/result";
import { movesSettlementBalance } from "@/lib/domain/expense";
import { expenseRepository } from "@/lib/repositories";
import type { ExpenseRepository } from "@/lib/repositories/expense.repository";

const idSchema = z.object({ id: z.string().min(1) });

/** `not_found` also covers "not yours" — the row matched no owned expense. */
export type DeleteExpenseCode =
    | "validation"
    | "unauthenticated"
    | "not_found"
    /** The row sits in a closed settlement cycle, so it is frozen (spec 0007 §3.5). */
    | "cycle_closed"
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
 * A row a **closed settlement cycle counted** is refused (spec 0007 §3.5). A solo
 * expense of the same age moves no balance and stays deletable.
 */
export async function deleteExpense(
    input: unknown,
    repo: ExpenseRepository = expenseRepository,
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
        // Read before deleting: whether the row is frozen is the server's fact,
        // and a missing row short-circuits here rather than after the attempt.
        const existing = await repo.getById(userId, id);
        if (!existing) {
            return {
                ok: false,
                code: "not_found",
                message: "Expense not found.",
            };
        }
        // Frozen = the row's cycle is closed AND that cycle counted the row. An
        // unshared expense inside a closed cycle counts for nothing and stays editable.
        if (existing.cycleClosedAt && movesSettlementBalance(existing)) {
            return {
                ok: false,
                code: "cycle_closed",
                message: existing.isPartnerPayment
                    ? "This payment counts in a settlement you already closed, so it can't be deleted."
                    : "Your partner's share of this expense counts in a settlement you already closed, so it can't be deleted.",
            };
        }

        const count = await repo.deleteForUser(userId, id);
        if (count === 0) {
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
