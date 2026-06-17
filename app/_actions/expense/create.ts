"use server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { expenseInputSchema } from "@/lib/schemas/expense";

// CDMX is UTC-6 year-round (no DST) — spec 0001 §Time and dates. A calendar
// date entered in the form is stored as the UTC instant of that day's local
// midnight, so month-boundary queries (slice 1.5) land in the right month.
const CDMX_UTC_OFFSET_HOURS = 6;

export type CreateExpenseResult =
    | { ok: true; id: string }
    | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

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
        const fieldErrors: Record<string, string[]> = {};
        for (const issue of parsed.error.issues) {
            const key = issue.path.join(".") || "_";
            (fieldErrors[key] ??= []).push(issue.message);
        }
        return { ok: false, error: "Invalid expense", fieldErrors };
    }

    const session = await auth();
    // Session user id is wired by the Credentials callbacks in slice 1.3; until
    // then there's no live session, so this guards rather than assumes.
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!userId) {
        return { ok: false, error: "Not authenticated" };
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

    return { ok: true, id: created.id };
}
