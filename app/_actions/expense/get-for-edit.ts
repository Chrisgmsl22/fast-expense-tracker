"use server";

import { auth } from "@/auth";
import {
    getExpenseById,
    type ExpenseEditable,
} from "@/lib/services/expense/expense.service";

/**
 * Fetch one expense's editable fields for the edit modal. Scoped to
 * the signed-in user via `getExpenseById`; returns null when unauthenticated or
 * when the row isn't theirs, so the client simply can't open an edit it doesn't own.
 */
export async function getExpenseForEdit(
    id: string,
): Promise<ExpenseEditable | null> {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId || !id) return null;
    return getExpenseById(userId, id);
}
