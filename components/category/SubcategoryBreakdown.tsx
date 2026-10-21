import { useTranslations } from "next-intl";

import { useCategoryName } from "@/i18n/category-name";
import type { SubcategoryBar } from "@/lib/domain/category";
import { formatMxn } from "@/lib/format";

/**
 * Every figure here is funding-filtered (spec 0007 §2) — amounts, percents, and
 * which subcategories read as zero. When the filter held money back, all three
 * need scoping, or the section states something false about the category.
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
    const t = useTranslations("category");
    const categoryName = useCategoryName();
    const withSpend = bars.filter((b) => b.spent > 0);
    const zero = bars.filter((b) => b.spent === 0);
    // Bars are sorted high→low, so the first is the max used for scaling.
    const max = withSpend[0]?.spent ?? 0;
    // The filter held money back, so every label below has to say so.
    const filtered = spentNotFromIncome > 0;

    return (
        <section>
            <div className="mb-3">
                <div className="flex items-baseline justify-between gap-3">
                    <h2 className="text-sm font-semibold">
                        {t("breakdown.title")}
                    </h2>
                    {!filtered && (
                        <span className="hidden text-xs text-muted-foreground sm:inline">
                            {t("breakdown.subtitle")}
                        </span>
                    )}
                </div>
                {withSpend.length > 0 && filtered && (
                    // Not desktop-only: it scopes the amounts and percents
                    // beside it. Gated on the bars — with none there is
                    // nothing to scope, and the empty state below says which
                    // spend is missing.
                    <p
                        data-testid="breakdown-scope"
                        className="mt-0.5 text-xs text-muted-foreground"
                    >
                        {t("breakdown.scope")}
                    </p>
                )}
            </div>

            {withSpend.length === 0 ? (
                <p
                    data-testid="breakdown-empty"
                    className="py-6 text-center text-sm text-muted-foreground"
                >
                    {spentNotFromIncome > 0
                        ? t("breakdown.emptyFiltered", {
                              label: t("nonIncomeLabel"),
                          })
                        : t("breakdown.empty")}
                </p>
            ) : (
                <ul className="space-y-3">
                    {withSpend.map((b) => (
                        <li key={b.id ?? "other"}>
                            <div className="flex items-baseline justify-between gap-3 text-sm">
                                <span className="truncate">
                                    {categoryName(b.name)}
                                </span>
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
                            {t("breakdown.zeroFiltered")}
                        </span>
                    )}
                    {zero.map((b) => (
                        <span key={b.id ?? "other"}>
                            {filtered
                                ? categoryName(b.name)
                                : t("breakdown.zeroItem", {
                                      name: categoryName(b.name),
                                  })}
                        </span>
                    ))}
                </p>
            )}
        </section>
    );
}
