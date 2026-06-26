import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getCurrentMonthCdmx, isValidMonth } from "@/lib/dates";
import { getExpensesForMonth } from "@/lib/services/expense/expense.service";
import { AddExpenseButton } from "@/components/expense/AddExpenseButton";
import { ExpenseListInteractive } from "@/components/expense/ExpenseListInteractive";
import { MonthPicker } from "@/components/expense/MonthPicker";

// Per-request, DB-backed data — never prerender at build (no DB in preview builds, ADR-0004).
export const dynamic = "force-dynamic";

export default async function ExpensesPage({
    searchParams,
}: {
    searchParams: Promise<{ month?: string }>;
}) {
    const { month: monthParam } = await searchParams;
    const month =
        monthParam && isValidMonth(monthParam)
            ? monthParam
            : getCurrentMonthCdmx();

    const session = await auth();
    const userId = session?.user?.id;
    // The proxy route gate guarantees a session; this satisfies the nullable
    // type and fails safe if it's ever reached without one.
    if (!userId) {
        return null;
    }

    const [categories, subcategories, cards, expenses] = await Promise.all([
        db.category.findMany({
            orderBy: { name: "asc" },
            select: { id: true, name: true },
        }),
        db.subcategory.findMany({
            select: { id: true, name: true, categoryId: true },
        }),
        db.card.findMany({
            orderBy: { name: "asc" },
            select: { id: true, name: true },
        }),
        getExpensesForMonth(userId, month),
    ]);

    return (
        <main className="p-8">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-semibold">Expenses</h1>
                <AddExpenseButton
                    categories={categories}
                    subcategories={subcategories}
                    cards={cards}
                />
            </div>
            <div className="mt-6">
                <MonthPicker month={month} />
            </div>
            <div className="mt-4">
                <ExpenseListInteractive
                    expenses={expenses}
                    categories={categories}
                    subcategories={subcategories}
                    cards={cards}
                />
            </div>
        </main>
    );
}
