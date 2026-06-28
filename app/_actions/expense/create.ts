"use server";

import { auth } from "@/auth";
import { toFieldErrors } from "@/lib/actions/field-errors";
import type { ActionResult } from "@/lib/actions/result";
import { cdmxCalendarDateToUtc } from "@/lib/dates";
import { computeActualExpenditure } from "@/lib/domain/expense";
import { expenseRepository } from "@/lib/repositories";
import { expenseInputSchema, type ExpenseInput } from "@/lib/schemas/expense";

/** Failure modes the caller can branch on. */
export type CreateExpenseCode = "validation" | "unauthenticated" | "db_error";

export type CreateExpenseResult = ActionResult<
    { id: string },
    ExpenseInput,
    CreateExpenseCode
>;

/**
 * Create an expense for the signed-in user (slice 1.4).
 *
 * Orchestration only: validate → authenticate → check the subcategory FK →
 * persist → map failures. The money math (`computeActualExpenditure`), the
 * CDMX→UTC date, and the DB writes each live in their own unit.
 *
 * `actualExpenditure` is computed server-side and stored, never trusted from the
 * client (spec 0001 §3). `paidBy` is persisted as-is — netting lives in the
 * settlement layer, never in the expense row (spec 0003).
 */
export async function createExpense(
    input: unknown,
): Promise<CreateExpenseResult> {
    const parsed = expenseInputSchema.safeParse(input);
    if (!parsed.success) {
        return {
            ok: false,
            code: "validation",
            message: "Invalid expense",
            fieldErrors: toFieldErrors<ExpenseInput>(parsed.error),
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

    // One try around every DB touch: a failure in the FK check or the insert
    // returns a typed error instead of throwing (no silent failure).
    try {
        // A subcategory must belong to the chosen category — both FKs are valid
        // individually, so without this check a mismatched pair would persist as
        // silently-wrong data. A missing subcategory returns null and fails too.
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

        const created = await expenseRepository.insert(userId, {
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
        return { ok: true, data: { id: created.id } };
    } catch (e) {
        // Don't leak DB internals to the client; surface a generic failure and
        // keep the typed contract so the form shows an error instead of
        // silently doing nothing.
        console.error("createExpense: db write failed", e);
        return {
            ok: false,
            code: "db_error",
            message: "Could not save the expense. Please try again.",
        };
    }
}
