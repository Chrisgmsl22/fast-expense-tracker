import type { ReactNode } from "react";

import { formatMxn } from "@/lib/format";
import { CategoryLimitEditor } from "@/components/category/CategoryLimitEditor";

const DANGER = "#dc2626";

/**
 * The category's budget status. Desktop: three stat cards (Spent my-share /
 * Monthly limit / Remaining) + a progress line. Mobile: a distinct hero — the
 * big my-share amount + a "$X left of your $Y limit" subtitle + progress bar
 * (per `category-detail-mobile.png`). A pencil on the limit (both layouts) opens
 * the per-month limit editor. A null effective limit reads "No limit".
 */
export function CategoryStats({
    slug,
    month,
    monthLabel,
    categoryName,
    color,
    spent,
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
                    <Stat label="Spent (my share)" value={formatMxn(spent)} />
                    <Stat
                        label="Monthly limit"
                        value={hasLimit ? formatMxn(limit!) : "No limit"}
                        action={editor("-mt-1 -mr-1")}
                    />
                    <Stat
                        label="Remaining"
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
                                {Math.round(pctOfLimit)}% of limit
                            </span>
                            {" · "}
                        </>
                    )}
                    {daysLeft} days left · {expenseCount}{" "}
                    {expenseCount === 1 ? "expense" : "expenses"} across{" "}
                    {subcatWithSpend}{" "}
                    {subcatWithSpend === 1 ? "subcategory" : "subcategories"}
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
                                {formatMxn(-remaining)} over your{" "}
                                {formatMxn(limit!)} limit
                            </span>
                        ) : (
                            <span className="text-positive">
                                {formatMxn(remaining)} left of your{" "}
                                {formatMxn(limit!)} limit
                            </span>
                        )
                    ) : (
                        <span className="text-muted-foreground">
                            No limit set
                        </span>
                    )}
                    {editor("-my-1")}
                </p>
                <div className="mt-3">{bar}</div>
            </div>
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
