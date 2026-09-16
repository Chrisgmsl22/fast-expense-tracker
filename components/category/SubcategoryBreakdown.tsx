import type { SubcategoryBar } from "@/lib/domain/category";
import { NON_INCOME_FUNDED_LABEL } from "@/lib/domain/funding";
import { formatMxn } from "@/lib/format";

/**
 * "Spend by subcategory" — the screen's headline. One bar per subcategory with
 * spend, high→low, each labelled with its amount and its share of the total the
 * bars themselves add up to. Bars are scaled to the top subcategory (so the
 * leader fills the track). Zero-spend subcategories (which exist but weren't
 * used this month) collapse into a single faint footer line rather than a row of
 * empty bars.
 *
 * EVERY FIGURE HERE IS FUNDING-FILTERED (spec 0007 §2) — amounts, percents, and
 * which subcategories count as zero. `spentNotFromIncome > 0` means the filter
 * held money back, and then all three of those need scoping or they state
 * something false about the category:
 *
 * - The percent's base is the filtered total, not the category's. With $238 of
 *   income-funded spend beside $3,700 from savings, the leader reads "100%" of
 *   $238. Recomputing it against $3,938 would be worse: the bars would sum to 6%
 *   and no row would account for the rest. So the base stays, and the section
 *   says what the base is.
 * - A subcategory the filter emptied is NOT a $0 subcategory. Printing
 *   "Entertainment — $0" directly above a $3,700 Entertainment row is the lie
 *   this guards; the names still list (they have no income-funded spend, which
 *   is true) but the bare amount goes.
 * - When the filter took every row, the empty state has to say WHICH spend is
 *   missing — "no spend this month" would contradict the header above it and
 *   the list below it.
 *
 * The empty state and the zero footer are mutually exclusive: with no bars, the
 * footer would only repeat the empty state's point with a list of names.
 */
export function SubcategoryBreakdown({
    bars,
    color,
    spentNotFromIncome,
}: {
    bars: SubcategoryBar[];
    color: string;
    /** My-share the funding filter kept out of these bars; 0 when none. */
    spentNotFromIncome: number;
}) {
    const withSpend = bars.filter((b) => b.spent > 0);
    const zero = bars.filter((b) => b.spent === 0);
    // Bars are sorted high→low, so the first is the max used for scaling.
    const max = withSpend[0]?.spent ?? 0;
    // The filter held money back, so nothing in this section speaks for the
    // whole category and every label below has to say so.
    const filtered = spentNotFromIncome > 0;

    return (
        <section>
            <div className="mb-3">
                <div className="flex items-baseline justify-between gap-3">
                    <h2 className="text-sm font-semibold">
                        Spend by subcategory
                    </h2>
                    {!filtered && (
                        <span className="hidden text-xs text-muted-foreground sm:inline">
                            where the money actually went
                        </span>
                    )}
                </div>
                {withSpend.length > 0 && filtered && (
                    // Not desktop-only: it scopes the amounts and percents
                    // beside it, so hiding it on mobile would leave the numbers
                    // reading as the category's own. Gated on the bars for the
                    // same reason the zero footer is: with none, there are no
                    // amounts and no percents to scope, and the empty state
                    // below already says which spend is missing.
                    <p
                        data-testid="breakdown-scope"
                        className="mt-0.5 text-xs text-muted-foreground"
                    >
                        {`Amounts and % below cover spend from this month's income only.`}
                    </p>
                )}
            </div>

            {withSpend.length === 0 ? (
                <p
                    data-testid="breakdown-empty"
                    className="py-6 text-center text-sm text-muted-foreground"
                >
                    {spentNotFromIncome > 0
                        ? `No spend from this month's income — see "${NON_INCOME_FUNDED_LABEL}" above.`
                        : "No spend in this category this month."}
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

            {withSpend.length > 0 && zero.length > 0 && (
                <p
                    data-testid="breakdown-zero"
                    className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground/60"
                >
                    {filtered && (
                        <span className="basis-full">
                            {`No spend from this month's income in:`}
                        </span>
                    )}
                    {zero.map((b) => (
                        <span key={b.id ?? "other"}>
                            {filtered ? b.name : `${b.name} — $0`}
                        </span>
                    ))}
                </p>
            )}
        </section>
    );
}
