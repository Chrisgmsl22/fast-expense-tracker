import { SAVINGS_SLUG } from "@/lib/domain/dashboard";
import { formatExpenseDate, formatMxn } from "@/lib/format";
import type { ExpenseListItem } from "@/lib/repositories/expense.repository";

const CASH_COLOR = "#16a34a";

/**
 * Right-rail month feed — a read-only, scrollable list of the month's expenses
 * with a pinned footer. The footer splits money into Charged / My share
 * (consumption — matches the dashboard's Spent) and, when savings is present,
 * Set aside (savings) + Total (money that actually left = my share + set aside).
 * Card-payment (blue) lines are deferred to 2.6; this shows expenses only.
 */
export function MonthFeed({
    expenses,
    monthLabel,
}: {
    expenses: ExpenseListItem[];
    monthLabel: string;
}) {
    // Split consumption from savings so "My share" matches the dashboard's
    // Spent (consumption only) and savings is surfaced on its own line.
    let charged = 0;
    let myShare = 0;
    let saved = 0;
    for (const e of expenses) {
        if (e.category.slug === SAVINGS_SLUG) {
            saved += e.actualExpenditure;
        } else {
            charged += e.amount;
            myShare += e.actualExpenditure;
        }
    }
    // Money that actually left this month = my-share consumption + savings.
    const total = myShare + saved;

    return (
        // Desktop: a sticky rail capped at ~viewport height so the feed is a
        // consistent section and the list scrolls internally when there are more
        // expenses than fit — the page never grows with the expense count. Mobile
        // (no cap): the feed shows inline and the page scrolls normally.
        <div className="flex flex-col rounded-lg border lg:sticky lg:top-6 lg:max-h-[calc(100vh-9rem)]">
            <div className="border-b p-4">
                <p className="text-sm font-medium">
                    All expenses · {monthLabel}
                </p>
                <p className="text-xs text-muted-foreground">
                    {expenses.length}{" "}
                    {expenses.length === 1 ? "entry" : "entries"}
                    {expenses.length > 0 ? " · scroll" : ""}
                </p>
            </div>

            {expenses.length === 0 ? (
                <p className="flex-1 p-8 text-center text-sm text-muted-foreground">
                    No expenses this month yet.
                </p>
            ) : (
                <ul className="min-h-0 flex-1 divide-y overflow-y-auto">
                    {expenses.map((e) => {
                        // Savings is a transfer — it has no card (never "Cash").
                        const isSavings = e.category.slug === SAVINGS_SLUG;
                        const cardColor = e.card?.color ?? CASH_COLOR;
                        const cardName = e.card?.name ?? "Cash";
                        return (
                            <li
                                key={e.id}
                                className="relative flex items-center gap-3 py-2.5 pr-4 pl-4"
                            >
                                <span
                                    aria-hidden
                                    className="absolute top-1/2 left-0 h-6 w-[3px] -translate-y-1/2 rounded-full"
                                    style={{
                                        backgroundColor: e.category.color,
                                    }}
                                />
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-medium">
                                        {e.description}
                                    </span>
                                    <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                                        {formatExpenseDate(e.date)}
                                        {isSavings ? null : (
                                            <>
                                                {" · "}
                                                <span
                                                    aria-hidden
                                                    className="size-2 shrink-0 rounded-full"
                                                    style={{
                                                        backgroundColor:
                                                            cardColor,
                                                    }}
                                                />
                                                {cardName}
                                            </>
                                        )}
                                    </span>
                                </span>
                                <span className="text-right whitespace-nowrap">
                                    <span className="block text-sm font-semibold">
                                        {formatMxn(e.amount)}
                                    </span>
                                    {e.isShared ? (
                                        <span className="block text-xs text-positive">
                                            {`share ${formatMxn(e.actualExpenditure)}`}
                                        </span>
                                    ) : (
                                        <span className="block text-xs text-muted-foreground">
                                            solo
                                        </span>
                                    )}
                                </span>
                            </li>
                        );
                    })}
                </ul>
            )}

            {expenses.length > 0 && (
                <div
                    data-testid="feed-totals"
                    className="space-y-1 border-t p-4 text-sm"
                >
                    <div className="flex justify-between">
                        <span className="font-medium text-foreground">
                            Charged
                        </span>
                        <span className="font-semibold text-foreground">
                            {formatMxn(charged)}
                        </span>
                    </div>
                    <div className="flex justify-between">
                        <span className="font-medium text-foreground">
                            My share
                        </span>
                        <span className="font-semibold text-positive">
                            {formatMxn(myShare)}
                        </span>
                    </div>
                    {saved > 0 && (
                        <>
                            <div className="flex justify-between">
                                <span className="font-medium text-foreground">
                                    Set aside
                                </span>
                                <span className="font-semibold text-bucket-savings">
                                    {formatMxn(saved)}
                                </span>
                            </div>
                            <div className="flex justify-between border-t pt-1">
                                <span className="font-medium text-foreground">
                                    Total
                                </span>
                                <span className="font-semibold text-foreground">
                                    {formatMxn(total)}
                                </span>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
