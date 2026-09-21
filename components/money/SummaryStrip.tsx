"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";

import type { CoupleBalance } from "@/lib/domain/settlement";
import type { FeedTotals } from "@/lib/domain/movement";
import { formatMxn } from "@/lib/format";
import { SettlementReminder } from "@/components/money/SettlementReminder";
import { MonthBreakdownDialog } from "@/components/money/MonthBreakdownDialog";
import { summaryMetrics } from "@/components/money/summary-model";

type Props = {
    totals: FeedTotals;
    monthLabel: string;
    partnerName: string;
    settlement?: CoupleBalance;
    sharesExpenses: boolean;
    isCurrentMonth: boolean;
    incomeTotal?: number;
    visibleCount: number;
    categoryLabel: string;
};

const METRIC_COLOR: Record<string, string> = {
    charged: "text-foreground",
    cost: "bg-spent-tint text-spent",
    "outside-income": "text-bucket-discretionary",
    partner: "text-positive",
    "set-aside": "text-bucket-savings",
};

export function SummaryStrip({
    totals,
    monthLabel,
    partnerName,
    settlement,
    sharesExpenses,
    isCurrentMonth,
    incomeTotal,
    visibleCount,
    categoryLabel,
}: Props) {
    const metrics = summaryMetrics(totals, partnerName, sharesExpenses);
    const footerRef = useRef<HTMLElement>(null);
    const [footerHeight, setFooterHeight] = useState(350);

    useEffect(() => {
        const footer = footerRef.current;
        if (!footer || typeof ResizeObserver === "undefined") return;
        const observer = new ResizeObserver(([entry]) => {
            if (entry) setFooterHeight(footer.getBoundingClientRect().height);
        });
        observer.observe(footer);
        return () => observer.disconnect();
    }, []);

    return (
        <>
            <div
                aria-hidden
                className="sm:hidden"
                style={{ height: footerHeight }}
            />
            <section
                ref={footerRef}
                data-testid="totals-footer"
                aria-label="Visible activity totals"
                className="fixed inset-x-0 bottom-0 z-40 overflow-hidden border bg-background pb-[env(safe-area-inset-bottom)] shadow-lg sm:sticky sm:bottom-4 sm:z-30 sm:mt-4 sm:rounded-xl sm:pb-0"
            >
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b bg-muted/40 px-4 py-2 text-[11px] text-muted-foreground">
                    <p>
                        <span className="font-semibold text-foreground">
                            {visibleCount}{" "}
                            {visibleCount === 1 ? "entry" : "entries"}
                        </span>{" "}
                        · {monthLabel} · {categoryLabel}
                    </p>
                    <p>Totals follow filters</p>
                </div>
                <SettlementReminder
                    settlement={settlement}
                    partnerName={partnerName}
                    sharesExpenses={sharesExpenses}
                    isCurrentMonth={isCurrentMonth}
                    monthLabel={monthLabel}
                    variant="band"
                />
                <div className="sm:flex sm:flex-wrap">
                    <dl className="grid min-w-0 flex-1 grid-cols-2 sm:grid-cols-4">
                        {metrics.map((metric) => (
                            <div
                                key={metric.key}
                                className={`min-w-0 border-r border-b px-4 py-3 last:border-r-0 sm:border-b-0 ${METRIC_COLOR[metric.key]}`}
                            >
                                <dt className="break-words text-xs">
                                    {metric.label}
                                </dt>
                                <dd className="mt-1 text-lg font-bold tabular-nums">
                                    {formatMxn(metric.amount)}
                                </dd>
                            </div>
                        ))}
                    </dl>
                    <div className="flex items-center justify-center border-t px-4 py-2 sm:border-t-0">
                        <MonthBreakdownDialog
                            totals={totals}
                            monthLabel={monthLabel}
                            partnerName={partnerName}
                            incomeTotal={incomeTotal}
                            triggerClassName="flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-semibold transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring sm:w-auto sm:border"
                            trigger={
                                <>
                                    Full breakdown
                                    <ChevronRight
                                        aria-hidden
                                        className="size-3.5"
                                    />
                                </>
                            }
                        />
                    </div>
                </div>
            </section>
        </>
    );
}
