import { useId } from "react";
import { ArrowDown, ArrowUp, ChevronRight, Plus } from "lucide-react";

import type { CoupleBalance } from "@/lib/domain/settlement";
import type { FeedTotals } from "@/lib/domain/movement";
import { FROM_SAVINGS_LABEL } from "@/lib/domain/funding";
import { formatMxn } from "@/lib/format";
import { cn } from "@/lib/utils";
import { SettlementReminder } from "@/components/money/SettlementReminder";
import { MonthBreakdownDialog } from "@/components/money/MonthBreakdownDialog";
import type { FundingRows } from "@/components/money/FundingSplit";
import { summaryCost } from "@/components/money/summary-model";

/**
 * The month at a glance: what it cost me, what I kept, and the cash between me
 * and the partner. Every other figure lives in the Full breakdown it opens.
 */
export function SummaryRail({
    totals,
    monthLabel,
    partnerName,
    settlement,
    sharesExpenses,
    isCurrentMonth,
    incomeTotal,
    fundingRows,
}: {
    totals: FeedTotals;
    fundingRows: FundingRows;
    monthLabel: string;
    partnerName: string;
    settlement?: CoupleBalance;
    sharesExpenses: boolean;
    isCurrentMonth: boolean;
    incomeTotal?: number;
}) {
    const cost = summaryCost(totals);
    const fromSavings = totals.notFromIncome.fromSavings.amount;
    const sent = totals.paidToPartner.amount;
    const received = totals.partnerPaidYou;
    const showPartner = sharesExpenses || sent > 0 || received > 0;

    return (
        <section
            data-testid="feed-totals"
            aria-label={`${monthLabel} summary`}
            className="shrink-0 space-y-2.5 border-t p-4 text-sm"
        >
            <SettlementReminder
                settlement={settlement}
                partnerName={partnerName}
                sharesExpenses={sharesExpenses}
                isCurrentMonth={isCurrentMonth}
                monthLabel={monthLabel}
            />
            <div className="overflow-hidden rounded-xl border border-l-4 border-l-spent">
                <div className="p-3.5">
                    <h3 className="text-[13px] font-semibold text-muted-foreground">
                        What {monthLabel} cost me
                    </h3>
                    <p className="mt-0.5 text-[28px] leading-tight font-bold tracking-tight tabular-nums">
                        {formatMxn(cost.amount)}
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                        {formatMxn(totals.charged.amount)} charged
                    </p>
                    <div
                        aria-hidden
                        className="mt-3 mb-2 flex h-2 overflow-hidden rounded-full bg-muted"
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
                    {/* The rows add up to the headline. Reimbursed money is
                        not in it: it was paid back, net $0. */}
                    <dl className="tabular-nums">
                        {totals.whatIReallySpent.amount > 0 && (
                            <LegendRow
                                label="From this month's income"
                                amount={totals.whatIReallySpent.amount}
                                swatchClassName="bg-spent"
                            />
                        )}
                        {fromSavings > 0 && (
                            <LegendRow
                                label={FROM_SAVINGS_LABEL}
                                amount={fromSavings}
                                swatchClassName="bg-bucket-discretionary"
                                amountClassName="text-bucket-discretionary"
                            />
                        )}
                    </dl>
                </div>
                <MonthBreakdownDialog
                    totals={totals}
                    monthLabel={monthLabel}
                    partnerName={partnerName}
                    incomeTotal={incomeTotal}
                    fundingRows={fundingRows}
                    triggerClassName="flex w-full items-center gap-2 border-t px-3.5 py-3 text-left text-sm font-semibold transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                    trigger={
                        <>
                            Full breakdown
                            <ChevronRight
                                aria-hidden
                                className="ml-auto size-4"
                            />
                        </>
                    }
                />
            </div>
            {totals.setAside > 0 && (
                <dl className="flex items-center gap-2.5 rounded-full border border-positive/30 bg-positive-tint px-4 py-2 tabular-nums">
                    <dt className="flex items-center gap-2.5">
                        <span
                            aria-hidden
                            className="grid size-5 shrink-0 place-items-center rounded-full bg-positive text-white"
                        >
                            <Plus className="size-3" strokeWidth={3} />
                        </span>
                        Saved
                    </dt>
                    <dd className="ml-auto font-bold text-positive">
                        {formatMxn(totals.setAside)}
                    </dd>
                </dl>
            )}
            {showPartner && (
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-full border border-transfer/40 bg-transfer-tint px-4 py-2">
                    <span className="font-semibold">{partnerName}</span>
                    {/* No net figure: who owes whom belongs to the settlement
                        chip above. The arrows carry no meaning on their own, so
                        each flow is named in words. */}
                    <ul className="ml-auto flex flex-wrap justify-end gap-x-3.5 gap-y-1 text-[13px] tabular-nums">
                        <Flow
                            label={`You sent ${partnerName}`}
                            amount={sent}
                            direction="out"
                        />
                        <Flow
                            label={`${partnerName} sent you`}
                            amount={received}
                            direction="in"
                        />
                    </ul>
                </div>
            )}
        </section>
    );
}

function LegendRow({
    label,
    amount,
    swatchClassName,
    amountClassName,
}: {
    label: string;
    amount: number;
    swatchClassName: string;
    amountClassName?: string;
}) {
    return (
        <div className="flex min-h-7 items-center gap-2">
            <span
                aria-hidden
                className={cn(
                    "size-2.5 shrink-0 rounded-full",
                    swatchClassName,
                )}
            />
            <dt>{label}</dt>
            <dd className={cn("ml-auto font-semibold", amountClassName)}>
                {formatMxn(amount)}
            </dd>
        </div>
    );
}

function Flow({
    label,
    amount,
    direction,
}: {
    label: string;
    amount: number;
    direction: "in" | "out";
}) {
    const Arrow = direction === "out" ? ArrowUp : ArrowDown;
    const figure = formatMxn(amount);
    // `listitem` does not support "name from content" (WAI-ARIA), so the name
    // has to be wired explicitly — but from real, rendered text (an sr-only
    // label plus the visible figure), never a hidden aria-label duplicate.
    // useId() keeps these unique when two rails render on one page.
    const id = useId();
    const labelId = `${id}-label`;
    const amountId = `${id}-amount`;
    return (
        <li
            aria-labelledby={`${labelId} ${amountId}`}
            className="inline-flex items-center gap-1.5"
        >
            <span
                aria-hidden
                className={cn(
                    "grid size-5 shrink-0 place-items-center rounded-full bg-card ring-1 ring-transfer/40",
                    direction === "out" ? "text-money-out" : "text-positive",
                )}
            >
                <Arrow className="size-3" strokeWidth={2.75} />
            </span>
            <span id={labelId} className="sr-only">
                {label}
            </span>
            <span id={amountId} className="font-semibold">
                {figure}
            </span>
        </li>
    );
}
