import { useLocale, useTranslations } from "next-intl";

import { RowFundingBadge } from "@/components/expense/FundingBadge";
import { useCategoryName } from "@/i18n/category-name";
import { formatExpenseDate, formatMxn } from "@/lib/format";
import type { CategoryExpenseListItem } from "@/lib/repositories/category.repository";

export function CategoryExpenses({
    expenses,
    color,
}: {
    expenses: CategoryExpenseListItem[];
    color: string;
}) {
    const t = useTranslations("category.expenses");
    const locale = useLocale();
    const categoryName = useCategoryName();
    return (
        <section>
            <h2 className="mb-3 text-sm font-semibold">
                <span className="sm:hidden">{t("titleShort")}</span>
                <span className="hidden sm:inline">{t("title")}</span>
            </h2>

            {expenses.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                    {t("empty")}
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
                                    <RowFundingBadge row={e} />
                                </span>
                                {e.subcategory && (
                                    <span
                                        className="mt-0.5 block truncate text-xs font-medium"
                                        style={{ color }}
                                    >
                                        {categoryName(e.subcategory.name)}
                                    </span>
                                )}
                            </span>

                            <span className="hidden whitespace-nowrap text-xs text-muted-foreground sm:block">
                                {formatExpenseDate(e.date, locale)}
                                {e.card ? ` · ${e.card.name}` : ""}
                            </span>

                            <span className="text-right whitespace-nowrap">
                                <span className="block text-sm font-semibold">
                                    {formatMxn(e.amount)}
                                </span>
                                {e.isShared && (
                                    <span className="block text-xs text-positive">
                                        {t("myShare", {
                                            amount: formatMxn(
                                                e.actualExpenditure,
                                            ),
                                        })}
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
