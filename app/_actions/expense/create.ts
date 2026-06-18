"use server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { expenseInputSchema, type ExpenseInput } from "@/lib/schemas/expense";
import type { ActionResult, FieldErrors } from "@/lib/actions/result";

// CDMX is UTC-6 year-round (no DST) — spec 0001 §Time and dates. A calendar
// date entered in the form is stored as the UTC instant of that day's local
// midnight, so month-boundary queries (slice 1.5) land in the right month.
const CDMX_UTC_OFFSET_HOURS = 6;

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
 * `actualExpenditure` is computed server-side and stored, never trusted from the
 * client (spec 0001 §3). `paidBy` is persisted as-is — netting lives in the
 * settlement layer, never in the expense row (spec 0003).
 */
export async function createExpense(
    input: unknown,
): Promise<CreateExpenseResult> {
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

    const session = await auth();
    // `session.user.id` is typed via types/next-auth.d.ts and populated by the
    // Credentials callbacks in slice 1.3; until then there's no live session, so
    // this guards rather than assumes.
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
    const d = v.date;
    const dateUtc = new Date(
        Date.UTC(
            d.getUTCFullYear(),
            d.getUTCMonth(),
            d.getUTCDate(),
            CDMX_UTC_OFFSET_HOURS,
        ),
    );

    // One try around every DB touch: the subcategory check and the insert both
    // hit the DB, so a failure in either returns a typed error instead of
    // throwing (no silent failure).
    try {
        // A subcategory must belong to the chosen category — both FKs are valid
        // individually, so without this check a mismatched pair would persist
        // as silently-wrong data.
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

        const created = await db.expense.create({
            data: {
                userId,
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
                isRecurring: false,
                originalAmount: null,
                originalCurrency: null,
            },
            select: { id: true },
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
