import type { ReactNode } from "react";
import { useTranslations } from "next-intl";

import { formatMxn } from "@/lib/format";
import { CategoryLimitEditor } from "@/components/category/CategoryLimitEditor";

const DANGER = "#dc2626";

/**
 * The category's budget status. Desktop: three stat cards (Spent my-share /
 * Monthly limit / Remaining) + a progress line. Mobile: a distinct hero — the
 * big my-share amount + a "$X left of your $Y limit" subtitle + progress bar
 * (per `category-detail-mobile.png`). A pencil on the limit (both layouts) opens
 * the per-month limit editor. A null effective limit reads "No limit".
 *
 * When the filter held money back, one shared line names what `spent` left out
 * (spec 0007 §2). It points at the LIST, not at the subcategory bars between
 * them — those are funding-filtered too.
 */
export function CategoryStats({
    slug,
    month,
    monthLabel,
    categoryName,
    color,
    spent,
    spentNotFromIncome,
    limit,
    defaultBudget,
    thisMonthOverride,
    hasLimit,
    remaining,
    over,
    pctOfLimit,
    daysLeft,
    expenseCount,
    subcatWithSpend,
}: {
    slug: string;
    month: string;
    monthLabel: string;
    categoryName: string;
    color: string;
    spent: number;
    /** My-share the budget left out this month — savings-funded or reimbursed. */
    spentNotFromIncome: number;
    /** Effective limit for the month (override ?? default), or null. */
    limit: number | null;
    defaultBudget: number | null;
    thisMonthOverride: number | null;
    hasLimit: boolean;
    remaining: number | null;
    over: boolean;
    pctOfLimit: number;
    daysLeft: number;
    expenseCount: number;
    subcatWithSpend: number;
}) {
    const t = useTranslations("category");
    const barWidth = hasLimit ? Math.min(100, pctOfLimit) : 0;

    const editor = (className?: string) => (
        <CategoryLimitEditor
            slug={slug}
            month={month}
            monthLabel={monthLabel}
            categoryName={categoryName}
            defaultBudget={defaultBudget}
            thisMonthOverride={thisMonthOverride}
            className={className}
        />
    );

    const bar = (
        <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
                className="h-full rounded-full"
                style={{
                    width: `${barWidth}%`,
                    backgroundColor: over ? DANGER : color,
                }}
            />
        </div>
    );

    return (
        <div>
            {/* Desktop: three stat cards + progress line */}
            <div
                data-testid="category-stats-desktop"
                className="hidden sm:block"
            >
                <div className="grid grid-cols-3 gap-3">
                    <Stat
                        label={t("stats.spentMyShare")}
                        value={formatMxn(spent)}
                    />
                    <Stat
                        label={t("stats.monthlyLimit")}
                        value={
                            hasLimit ? formatMxn(limit!) : t("stats.noLimit")
                        }
                        action={editor("-mt-1 -mr-1")}
                    />
                    <Stat
                        label={t("stats.remaining")}
                        value={
                            !hasLimit || remaining === null
                                ? "—"
                                : over
                                  ? `−${formatMxn(-remaining)}`
                                  : formatMxn(remaining)
                        }
                        valueClass={
                            hasLimit
                                ? over
                                    ? "text-danger"
                                    : "text-positive"
                                : undefined
                        }
                    />
                </div>

                <div className="mt-4">{bar}</div>

                <p
                    data-testid="category-progress"
                    className="mt-1.5 text-xs text-muted-foreground"
                >
                    {hasLimit && (
                        <>
                            <span className={over ? "text-danger" : undefined}>
                                {t("stats.pctOfLimit", {
                                    pct: Math.round(pctOfLimit),
                                })}
                            </span>
                            {" · "}
                        </>
                    )}
                    {t("stats.progress", {
                        daysLeft,
                        expenseCount,
                        subcatCount: subcatWithSpend,
                    })}
                </p>
            </div>

            {/* Mobile: hero amount + limit subtitle + progress bar */}
            <div data-testid="category-stats-mobile" className="sm:hidden">
                <p className="text-center text-4xl font-bold">
                    {formatMxn(spent)}
                </p>
                <p className="mt-1 flex items-center justify-center gap-1 text-center text-sm">
                    {hasLimit && remaining !== null ? (
                        over ? (
                            <span className="text-danger">
                                {t("stats.overYourLimit", {
                                    amount: formatMxn(-remaining),
                                    limit: formatMxn(limit!),
                                })}
                            </span>
                        ) : (
                            <span className="text-positive">
                                {t("stats.leftOfYourLimit", {
                                    amount: formatMxn(remaining),
                                    limit: formatMxn(limit!),
                                })}
                            </span>
                        )
                    ) : (
                        <span className="text-muted-foreground">
                            {t("stats.noLimitSet")}
                        </span>
                    )}
                    {editor("-my-1")}
                </p>
                <div className="mt-3">{bar}</div>
            </div>

            {spentNotFromIncome > 0 && (
                <p
                    data-testid="category-non-income"
                    className="mt-2 text-center text-xs text-muted-foreground sm:text-left"
                >
                    {t("stats.nonIncome", {
                        label: t("nonIncomeLabel"),
                        amount: formatMxn(spentNotFromIncome),
                    })}
                </p>
            )}
        </div>
    );
}

function Stat({
    label,
    value,
    valueClass,
    action,
}: {
    label: string;
    value: string;
    valueClass?: string;
    action?: ReactNode;
}) {
    return (
        <div className="rounded-lg border bg-card p-4">
            <div className="flex items-start justify-between">
                <p className="text-xs text-muted-foreground">{label}</p>
                {action}
            </div>
            <p className={`mt-1 text-2xl font-bold ${valueClass ?? ""}`}>
                {value}
            </p>
        </div>
    );
}
