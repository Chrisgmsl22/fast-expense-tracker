import { FundingBadge } from "@/components/expense/FundingBadge";
import { formatExpenseDate, formatMxn } from "@/lib/format";
import type { CategoryExpenseListItem } from "@/lib/repositories/category.repository";

/**
 * Badges on `countedInBudget` (the SQL filter's verdict on the raw column), not
 * on `fundedFrom` — which reads an out-of-band value back as `income` and would
 * leave the one row that most needs a badge bare. Hence the `"unknown"` mapping.
 */
export function CategoryExpenses({
    expenses,
    color,
}: {
    expenses: CategoryExpenseListItem[];
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
                                <span className="flex min-w-0 items-center gap-2">
                                    <span className="truncate text-sm font-medium">
                                        {e.description}
                                    </span>
                                    {!e.countedInBudget && (
                                        <FundingBadge
                                            source={
                                                e.fundedFrom === "income"
                                                    ? "unknown"
                                                    : e.fundedFrom
                                            }
                                        />
                                    )}
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
