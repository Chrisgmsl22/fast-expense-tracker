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
