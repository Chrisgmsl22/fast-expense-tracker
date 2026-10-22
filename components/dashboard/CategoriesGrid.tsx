import Link from "next/link";
import { useTranslations } from "next-intl";

import { useCategoryName } from "@/i18n/category-name";
import { formatMxn } from "@/lib/format";
import type { CategoryBudgetItem } from "@/lib/repositories/dashboard.repository";

const DANGER = "#dc2626";

/**
 * Per-category budget grid — one card per spent category (high→low): a
 * rounded-square color dot + name + my-share spent, a progress bar vs the
 * category's `monthlyBudget` (danger when over), the limit/left/over status,
 * and "N of M subcats". A null budget reads "no limit" (no fill). Each card
 * links to `/category/[slug]` for the viewed month.
 */
export function CategoriesGrid({
    categories,
    month,
}: {
    categories: CategoryBudgetItem[];
    month: string;
}) {
    const t = useTranslations("dashboard.categories");
    if (categories.length === 0) {
        return (
            <p className="py-8 text-center text-sm text-muted-foreground">
                {t("empty")}
            </p>
        );
    }

    return (
        <div>
            <div className="mb-3 flex items-baseline justify-between">
                <h2 className="text-sm font-medium">{t("title")}</h2>
                <span className="text-xs text-muted-foreground">
                    {t("subtitle")}
                </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {categories.map((c) => (
                    <CategoryCard key={c.slug} category={c} month={month} />
                ))}
            </div>
        </div>
    );
}

function CategoryCard({
    category: c,
    month,
}: {
    category: CategoryBudgetItem;
    month: string;
}) {
    const t = useTranslations("dashboard.categories");
    const categoryName = useCategoryName();
    const hasBudget = c.monthlyBudget !== null && c.monthlyBudget > 0;
    const remaining = hasBudget ? c.monthlyBudget! - c.spent : 0;
    const over = hasBudget && remaining < 0;
    const pct = hasBudget
        ? Math.min(100, (c.spent / c.monthlyBudget!) * 100)
        : 0;

    return (
        <Link
            href={`/category/${c.slug}?month=${month}`}
            className="rounded-lg border p-3 transition-colors hover:bg-muted/50"
        >
            <div className="flex items-center gap-2">
                <span
                    aria-hidden
                    className="size-2.5 shrink-0 rounded-[3px]"
                    style={{ backgroundColor: c.color }}
                />
                <span className="truncate text-sm font-semibold text-foreground/80">
                    {categoryName(c.name)}
                </span>
                <span className="ml-auto font-semibold whitespace-nowrap">
                    {formatMxn(c.spent)}
                </span>
            </div>

            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                    className="h-full rounded-full"
                    style={{
                        width: `${pct}%`,
                        backgroundColor: over ? DANGER : c.color,
                    }}
                />
            </div>

            <p className="mt-1.5 text-xs text-muted-foreground">
                {!hasBudget ? (
                    t("noLimit")
                ) : over ? (
                    <span className="text-danger">
                        {t("overBy", { amount: formatMxn(-remaining) })}
                    </span>
                ) : remaining === 0 ? (
                    t("maxed", { limit: formatMxn(c.monthlyBudget!) })
                ) : (
                    t("limitLeft", {
                        limit: formatMxn(c.monthlyBudget!),
                        remaining: formatMxn(remaining),
                    })
                )}
                {" · "}
                {t("subcats", {
                    withSpend: c.subcatWithSpend,
                    total: c.subcatTotal,
                })}
            </p>
        </Link>
    );
}
