import { db } from "@/lib/db";
import { getMonthRangeUtc } from "@/lib/dates";

export type ExpenseListItem = {
    id: string;
    date: Date;
    description: string;
    amount: number;
    actualExpenditure: number;
    isShared: boolean;
    category: { name: string };
    subcategory: { name: string } | null;
    card: { name: string } | null;
};

/** Full editable shape of one expense — what the edit form prefills. */
export type ExpenseEditable = {
    id: string;
    date: Date;
    amount: number;
    categoryId: string;
    subcategoryId: string | null;
    cardId: string | null;
    description: string;
    notes: string | null;
    isShared: boolean;
    yourPercentage: number;
    paidBy: string;
};

/**
 * One expense by id, **scoped to its owner**. Returns null when the row doesn't
 * exist or belongs to another user — the caller can't tell the two apart, which
 * is the point (no existence oracle). The list query is intentionally leaner
 * (names only); edit needs the foreign-key ids, so it fetches separately.
 */
export function getExpenseById(
    userId: string,
    id: string,
): Promise<ExpenseEditable | null> {
    return db.expense.findFirst({
        where: { id, userId },
        select: {
            id: true,
            date: true,
            amount: true,
            categoryId: true,
            subcategoryId: true,
            cardId: true,
            description: true,
            notes: true,
            isShared: true,
            yourPercentage: true,
            paidBy: true,
        },
    });
}

/**
 * Expenses for one CDMX month, newest first. `month` is `YYYY-MM`; the caller
 * resolves/validates it (see lib/dates). The half-open UTC range matches how
 * capture stores dates, so a row lands in the month the user picked.
 */
export function getExpensesForMonth(
    userId: string,
    month: string,
): Promise<ExpenseListItem[]> {
    const { start, end } = getMonthRangeUtc(month);
    return db.expense.findMany({
        where: { userId, date: { gte: start, lt: end } },
        orderBy: { date: "desc" },
        select: {
            id: true,
            date: true,
            description: true,
            amount: true,
            actualExpenditure: true,
            isShared: true,
            category: { select: { name: true } },
            subcategory: { select: { name: true } },
            card: { select: { name: true } },
        },
    });
}
