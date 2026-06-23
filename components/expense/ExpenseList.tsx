import { formatExpenseDate, formatMxn } from "@/lib/format";
import type { ExpenseListItem } from "@/lib/services/expense/expense.service";

export function ExpenseList({ expenses }: { expenses: ExpenseListItem[] }) {
    if (expenses.length === 0) {
        return (
            <p className="py-12 text-center text-sm text-muted-foreground">
                No expenses for this month yet.
            </p>
        );
    }

    return (
        <table className="w-full text-sm">
            <thead>
                <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Date</th>
                    <th className="py-2 pr-4 font-medium">Description</th>
                    <th className="py-2 pr-4 font-medium">Category</th>
                    <th className="py-2 pr-4 font-medium">Card</th>
                    <th className="py-2 pl-4 text-right font-medium">Amount</th>
                </tr>
            </thead>
            <tbody>
                {expenses.map((expense) => (
                    <tr key={expense.id} className="border-b last:border-0">
                        <td className="py-2 pr-4 whitespace-nowrap">
                            {formatExpenseDate(expense.date)}
                        </td>
                        <td className="py-2 pr-4">{expense.description}</td>
                        <td className="py-2 pr-4">
                            {expense.category.name}
                            {expense.subcategory
                                ? ` · ${expense.subcategory.name}`
                                : ""}
                        </td>
                        <td className="py-2 pr-4">
                            {expense.card?.name ?? "Cash"}
                        </td>
                        <td className="py-2 pl-4 text-right whitespace-nowrap">
                            {formatMxn(expense.amount)}
                            {expense.isShared ? (
                                <span className="block text-xs text-muted-foreground">
                                    your share{" "}
                                    {formatMxn(expense.actualExpenditure)}
                                </span>
                            ) : null}
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}
