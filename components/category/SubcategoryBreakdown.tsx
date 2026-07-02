import type { SubcategoryBar } from "@/lib/domain/category";
import { formatMxn } from "@/lib/format";

/**
 * "Spend by subcategory" — the screen's headline. One bar per subcategory with
 * spend, high→low, each labelled with its amount + percent of the category.
 * Bars are scaled to the top subcategory (so the leader fills the track).
 * Zero-spend subcategories (which exist but weren't used this month) collapse
 * into a single faint footer line rather than a row of empty bars.
 */
export function SubcategoryBreakdown({
    bars,
    color,
}: {
    bars: SubcategoryBar[];
    color: string;
}) {
    const withSpend = bars.filter((b) => b.spent > 0);
    const zero = bars.filter((b) => b.spent === 0);
    // Bars are sorted high→low, so the first is the max used for scaling.
    const max = withSpend[0]?.spent ?? 0;

    return (
        <section>
            <div className="mb-3 flex items-baseline justify-between">
                <h2 className="text-sm font-semibold">Spend by subcategory</h2>
                <span className="hidden text-xs text-muted-foreground sm:inline">
                    where the money actually went
                </span>
            </div>

            {withSpend.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                    No spend in this category this month.
                </p>
            ) : (
                <ul className="space-y-3">
                    {withSpend.map((b) => (
                        <li key={b.id ?? "other"}>
                            <div className="flex items-baseline justify-between gap-3 text-sm">
                                <span className="truncate">{b.name}</span>
                                <span className="whitespace-nowrap">
                                    <span className="font-semibold">
                                        {formatMxn(b.spent)}
                                    </span>
                                    <span className="text-muted-foreground">
                                        {" · "}
                                        {Math.round(b.pct)}%
                                    </span>
                                </span>
                            </div>
                            <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                                <div
                                    className="h-full rounded-full"
                                    style={{
                                        width: `${max > 0 ? (b.spent / max) * 100 : 0}%`,
                                        backgroundColor: color,
                                    }}
                                />
                            </div>
                        </li>
                    ))}
                </ul>
            )}

            {zero.length > 0 && (
                <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground/60">
                    {zero.map((b) => (
                        <span key={b.id ?? "other"}>{b.name} — $0</span>
                    ))}
                </p>
            )}
        </section>
    );
}
