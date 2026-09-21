import { ChevronRight, Plus } from "lucide-react";

import type { CoupleBalance } from "@/lib/domain/settlement";
import type { FeedTotals } from "@/lib/domain/movement";
import { formatMxn } from "@/lib/format";
import { SettlementReminder } from "@/components/money/SettlementReminder";
import { MonthBreakdownDialog } from "@/components/money/MonthBreakdownDialog";
import {
    summaryCost,
    TOTAL_LABEL,
    TOTAL_QUALIFIER,
} from "@/components/money/summary-model";

export function SummaryRail({
    totals,
    monthLabel,
    partnerName,
    settlement,
    sharesExpenses,
    isCurrentMonth,
    incomeTotal,
}: {
    totals: FeedTotals;
    monthLabel: string;
    partnerName: string;
    settlement?: CoupleBalance;
    sharesExpenses: boolean;
    isCurrentMonth: boolean;
    incomeTotal?: number;
}) {
    const cost = summaryCost(totals);
    const incomeRemainder =
        incomeTotal === undefined ? null : incomeTotal - totals.total;
    const hasPartnerDetails =
        totals.partnerPaidYou > 0 || totals.paidToPartner.amount > 0;

    return (
        <section
            data-testid="feed-totals"
            aria-label={`${monthLabel} summary`}
            className="shrink-0 border-t text-sm"
        >
            <div className="space-y-3.5 p-4">
                <SettlementReminder
                    settlement={settlement}
                    partnerName={partnerName}
                    sharesExpenses={sharesExpenses}
                    isCurrentMonth={isCurrentMonth}
                    monthLabel={monthLabel}
                />
                <div>
                    <h3 className="text-[10px] font-semibold tracking-wider text-spent uppercase">
                        What {monthLabel} cost me
                    </h3>
                    <p className="mt-1 text-[28px] leading-tight font-bold tracking-tight tabular-nums">
                        {formatMxn(cost.amount)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                        <span className="tabular-nums">
                            {formatMxn(totals.charged.amount)}
                        </span>{" "}
                        charged · my cost across all sources
                    </p>
                </div>
                <div>
                    <div
                        aria-hidden
                        className="flex h-2.5 overflow-hidden rounded-full bg-muted"
                    >
                        <div
                            className="bg-spent"
                            style={{ width: `${cost.incomePercent}%` }}
                        />
                        <div
                            className="bg-bucket-discretionary"
                            style={{ width: `${cost.outsideIncomePercent}%` }}
                        />
                    </div>
                    <dl className="mt-3 space-y-2 text-xs">
                        <div className="flex items-center gap-2">
                            <span
                                aria-hidden
                                className="size-2 shrink-0 rounded-sm bg-spent"
                            />
                            <dt>From this month&apos;s income</dt>
                            <dd className="ml-auto font-semibold tabular-nums">
                                {formatMxn(totals.whatIReallySpent.amount)}
                            </dd>
                        </div>
                        <div className="flex items-center gap-2">
                            <span
                                aria-hidden
                                className="size-2 shrink-0 rounded-sm bg-bucket-discretionary"
                            />
                            <dt>Outside income</dt>
                            <dd className="ml-auto font-semibold text-bucket-discretionary tabular-nums">
                                {formatMxn(totals.notFromIncome.amount)}
                            </dd>
                        </div>
                        <div className="flex items-center gap-2 border-t pt-2.5">
                            <Plus
                                aria-hidden
                                className="size-3 text-bucket-savings"
                            />
                            <dt>Set aside to savings</dt>
                            <dd className="ml-auto font-semibold text-bucket-savings tabular-nums">
                                {formatMxn(totals.setAside)}
                            </dd>
                        </div>
                    </dl>
                </div>
                <div className="space-y-2 rounded-lg bg-foreground p-3 text-background">
                    <div className="flex items-baseline justify-between gap-3">
                        <p className="text-xs text-background/70">
                            {TOTAL_LABEL} {TOTAL_QUALIFIER}
                        </p>
                        <p className="shrink-0 text-base font-bold tabular-nums">
                            {formatMxn(totals.total)}
                        </p>
                    </div>
                    {incomeRemainder !== null && incomeTotal !== undefined && (
                        <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1 text-[11px]">
                            <span className="text-background/70">
                                Income {formatMxn(incomeTotal)}
                            </span>
                            <span
                                className={`font-semibold tabular-nums ${incomeRemainder < 0 ? "text-danger" : "text-positive"}`}
                            >
                                {formatMxn(Math.abs(incomeRemainder))}{" "}
                                {incomeRemainder < 0 ? "over income" : "left"}
                            </span>
                        </div>
                    )}
                </div>
                {hasPartnerDetails && (
                    <dl className="space-y-1.5 border-t pt-3 text-xs text-muted-foreground">
                        {totals.partnerPaidYou > 0 && (
                            <div className="flex justify-between gap-2">
                                <dt>{partnerName} paid you</dt>
                                <dd className="font-medium text-foreground tabular-nums">
                                    {formatMxn(totals.partnerPaidYou)}
                                </dd>
                            </div>
                        )}
                        {totals.paidToPartner.amount > 0 && (
                            <div>
                                <div className="flex justify-between gap-2">
                                    <dt>You paid {partnerName}</dt>
                                    <dd className="font-medium text-foreground tabular-nums">
                                        {formatMxn(totals.paidToPartner.amount)}
                                    </dd>
                                </div>
                                {totals.paidToPartner.of.notFromIncome.amount >
                                    0 && (
                                    <div className="mt-1 flex justify-between gap-2 pl-3 text-[11px]">
                                        <dt>Of that, outside income</dt>
                                        <dd className="tabular-nums">
                                            {formatMxn(
                                                totals.paidToPartner.of
                                                    .notFromIncome.amount,
                                            )}
                                        </dd>
                                    </div>
                                )}
                            </div>
                        )}
                    </dl>
                )}
            </div>
            <MonthBreakdownDialog
                totals={totals}
                monthLabel={monthLabel}
                partnerName={partnerName}
                incomeTotal={incomeTotal}
                triggerClassName="flex w-full items-center gap-2 rounded-b-lg border-t px-4 py-3 text-xs font-semibold transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
                trigger={
                    <>
                        See full breakdown
                        <ChevronRight aria-hidden className="ml-auto size-4" />
                    </>
                }
            />
        </section>
    );
}
