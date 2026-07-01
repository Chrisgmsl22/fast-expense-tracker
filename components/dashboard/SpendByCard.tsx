import { formatMxn } from "@/lib/format";
import type { CardSpend } from "@/lib/repositories/dashboard.repository";

/**
 * Spend-by-card — a single horizontal stacked bar in each card's color + a
 * two-column legend of per-card my-share totals (high→low). Segment widths are
 * shares of the month's card spend. Pure display; the aggregation is in the
 * dashboard service.
 */
export function SpendByCard({ cards }: { cards: CardSpend[] }) {
    const total = cards.reduce((sum, c) => sum + c.spent, 0);

    return (
        <div className="rounded-lg border p-4">
            <p className="text-sm font-medium">Spend by card</p>
            {total === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">
                    No card spend this month.
                </p>
            ) : (
                <>
                    <div
                        data-testid="card-bar"
                        className="mt-3 flex h-2.5 overflow-hidden rounded-full"
                    >
                        {cards.map((c) => (
                            <div
                                key={c.id}
                                style={{
                                    width: `${(c.spent / total) * 100}%`,
                                    backgroundColor: c.color,
                                }}
                            />
                        ))}
                    </div>
                    <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2">
                        {cards.map((c) => (
                            <li
                                key={c.id}
                                className="flex items-center gap-1.5 text-xs text-muted-foreground"
                            >
                                <span
                                    aria-hidden
                                    className="size-1.5 shrink-0 rounded-full"
                                    style={{ backgroundColor: c.color }}
                                />
                                {c.name}
                                <span className="ml-auto font-semibold text-foreground">
                                    {formatMxn(c.spent)}
                                </span>
                            </li>
                        ))}
                    </ul>
                </>
            )}
        </div>
    );
}
