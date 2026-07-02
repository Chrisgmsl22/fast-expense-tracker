import { formatExpenseDate, formatMxn } from "@/lib/format";
import type { ExpenseListItem } from "@/lib/repositories/expense.repository";

/**
 * Read-only list of the category's expenses this month. Each row shows the
 * description, its subcategory (in the category color), the charged amount, and
 * — on shared rows — the my-share subtext. The date · card meta is desktop-only
 * to keep mobile rows compact (matches the design). Editing lives on /expenses.
 */
export function CategoryExpenses({
    expenses,
    color,
}: {
    expenses: ExpenseListItem[];
    color: string;
}) {
    return (
        <section>
            <h2 className="mb-3 text-sm font-semibold">
                <span className="sm:hidden">Expenses</span>
                <span className="hidden sm:inline">
                    Expenses in this category
                </span>
            </h2>

            {expenses.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                    No expenses in this category this month.
                </p>
            ) : (
                <ul className="divide-y rounded-lg border">
                    {expenses.map((e) => (
                        <li
                            key={e.id}
                            className="flex items-center gap-3 px-4 py-3"
                        >
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium">
                                    {e.description}
                                </span>
                                {e.subcategory && (
                                    <span
                                        className="mt-0.5 block truncate text-xs font-medium"
                                        style={{ color }}
                                    >
                                        {e.subcategory.name}
                                    </span>
                                )}
                            </span>

                            <span className="hidden whitespace-nowrap text-xs text-muted-foreground sm:block">
                                {formatExpenseDate(e.date)}
                                {e.card ? ` · ${e.card.name}` : ""}
                            </span>

                            <span className="text-right whitespace-nowrap">
                                <span className="block text-sm font-semibold">
                                    {formatMxn(e.amount)}
                                </span>
                                {e.isShared && (
                                    <span className="block text-xs text-positive">
                                        my share{" "}
                                        {formatMxn(e.actualExpenditure)}
                                    </span>
                                )}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
