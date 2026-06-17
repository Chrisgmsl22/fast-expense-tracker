import { db } from "@/lib/db";
import { AddExpenseButton } from "@/components/expense/AddExpenseButton";

// Per-request, DB-backed data — never prerender at build. Without this, the
// preview build (no DB, per ADR-0004) tries to prerender and fails connecting.
export const dynamic = "force-dynamic";

// Expenses page (1.4: capture). The chronological list + month filter land in
// 1.5. Category/subcategory/card options come from the DB (seeded in 1.2) —
// empty until then, which is fine; the "+ Add" modal still opens.
export default async function ExpensesPage() {
    const [categories, subcategories, cards] = await Promise.all([
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
        </main>
    );
}
