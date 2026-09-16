import { FundingBadge } from "@/components/expense/FundingBadge";
import { formatExpenseDate, formatMxn } from "@/lib/format";
import type { CategoryExpenseListItem } from "@/lib/repositories/category.repository";

/**
 * Read-only list of the category's expenses this month. Each row shows the
 * description, its subcategory (in the category color), the charged amount, and
 * — on shared rows — the my-share subtext. The date · card meta is desktop-only
 * to keep mobile rows compact (matches the design). Editing lives on /expenses.
 *
 * A row the budget skipped carries the same `FundingBadge` the two feeds use
 * (spec 0007 §3.2): the list shows every row whatever funded it, while `Spent`
 * above counts only income-funded ones, so without the badge the header would
 * read $0 over a visible $3,000 row and explain nothing.
 *
 * The badge condition is `countedInBudget` — the SQL filter's verdict on the raw
 * column — and NOT `fundedFrom !== "income"`. The prop type is
 * `CategoryExpenseListItem` for that reason alone: narrowing to
 * `ExpenseListItem` here would discard the flag at the boundary and leave the
 * one row that most needs a badge (an out-of-band value, dropped by the query
 * and read back as `income`) unbadged under a header pointing straight at it.
 *
 * Because the two disagree, this is the ONE caller that can reach the badge with
 * a `fundedFrom` of `income`, and it maps that to `"unknown"` here: past the
 * `countedInBudget` check, a narrowed `income` is exactly the out-of-band case
 * and nothing else. The badge itself does not accept `income`, so this mapping is
 * the compiler's business rather than a convention to remember.
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
