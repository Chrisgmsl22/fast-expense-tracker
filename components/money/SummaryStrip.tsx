import { ChevronRight } from "lucide-react";

import type { CoupleBalance } from "@/lib/domain/settlement";
import type { FeedTotals } from "@/lib/domain/movement";
import { formatMxn } from "@/lib/format";
import { SettlementReminder } from "@/components/money/SettlementReminder";
import { MonthBreakdownDialog } from "@/components/money/MonthBreakdownDialog";
import {
    TONE_TEXT_CLASS,
    TOTAL_LABEL,
    TOTAL_QUALIFIER,
    closingTotal,
    summaryLines,
    type SummaryLine,
    type SummaryPart,
} from "@/components/money/summary-model";

type Props = {
    totals: FeedTotals;
    monthLabel: string;
    partnerName: string;
    /** The OPEN cycle's balance — a cycle is not a month (spec 0007 §3.5). */
    settlement?: CoupleBalance;
    /** Solo mode has no partner to settle with, so the reminder is hidden. */
    sharesExpenses: boolean;
    /** False while browsing a past month — the reminder then says which scope it is. */
    isCurrentMonth: boolean;
    incomeTotal?: number;
};

const TRIGGER_CLASS =
    "flex items-center gap-1.5 rounded-md border border-background/20 px-3 py-1.5 text-xs font-semibold text-background transition-colors hover:bg-background/10";

export function SummaryStrip({
    totals,
    monthLabel,
    partnerName,
    settlement,
    sharesExpenses,
    isCurrentMonth,
    incomeTotal,
}: Props) {
    const lines = summaryLines(totals, partnerName);
    const total = closingTotal(totals);
    const spent = lines.find((line) => line.key === "spent");
    const rest = lines.filter((line) => line.key !== "spent");
    const reminder = (className: string) => (
        <SettlementReminder
            settlement={settlement}
            partnerName={partnerName}
            sharesExpenses={sharesExpenses}
            isCurrentMonth={isCurrentMonth}
            monthLabel={monthLabel}
            className={className}
        />
    );
    const breakdown = (
        <MonthBreakdownDialog
            totals={totals}
            monthLabel={monthLabel}
            partnerName={partnerName}
            incomeTotal={incomeTotal}
            triggerClassName={TRIGGER_CLASS}
            trigger={
                <>
                    Full breakdown
                    <ChevronRight aria-hidden className="size-3.5" />
                </>
            }
        />
    );

    return (
        <>
            <div className="sticky bottom-4 z-30 mt-4 hidden sm:block">
                {reminder("mb-2")}
                <div
                    data-testid="totals-desktop"
                    className="flex flex-wrap items-start gap-x-6 gap-y-3 rounded-lg bg-foreground px-5 py-3 text-background shadow-lg"
                >
                    {spent && <Column line={spent} emphasis />}
                    {rest.map((line) => (
                        <Column key={line.key} line={line} />
                    ))}
                    {total !== null && (
                        <div className="border-background/20 sm:border-l sm:pl-6">
                            <p className="text-xs text-background/70">
                                {TOTAL_LABEL} {TOTAL_QUALIFIER}
                            </p>
                            <p className="text-base font-semibold tabular-nums">
                                {formatMxn(total)}
                            </p>
                        </div>
                    )}
                    <div className="ml-auto self-center">{breakdown}</div>
                </div>
            </div>

            <div
                data-testid="totals-mobile"
                className="fixed inset-x-0 bottom-0 z-40 sm:hidden"
            >
                {reminder("border-t bg-background px-4 py-2")}
                <div className="space-y-1.5 bg-foreground px-5 py-2.5 text-background">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-background/70">
                        {rest.map((line) => (
                            <span key={line.key} className="whitespace-nowrap">
                                {shortLabelOf(line)}{" "}
                                <span className="font-medium text-background">
                                    {formatMxn(line.amount)}
                                </span>
                                {line.of.map((child) => (
                                    <span key={child.key} className="ml-1">
                                        (<span>{shortLabelOf(child)}</span>{" "}
                                        <span className="font-medium text-background">
                                            {formatMxn(child.amount)}
                                        </span>
                                        )
                                    </span>
                                ))}
                            </span>
                        ))}
                    </div>
                    <div className="flex items-end justify-between gap-3">
                        {spent && (
                            <span className="text-xs text-background/70">
                                {spent.label}
                                <span className="mt-0.5 block text-base font-semibold text-background">
                                    {formatMxn(spent.amount)}
                                </span>
                                {spent.of.map((child) => (
                                    <span
                                        key={child.key}
                                        className="block text-[11px]"
                                    >
                                        {shortLabelOf(child)}{" "}
                                        <span>{formatMxn(child.amount)}</span>
                                    </span>
                                ))}
                            </span>
                        )}
                        {total !== null && (
                            <span className="max-w-[9rem] text-right text-xs text-background/70">
                                {TOTAL_LABEL} {TOTAL_QUALIFIER}
                                <span className="mt-0.5 block text-lg font-semibold text-background">
                                    {formatMxn(total)}
                                </span>
                            </span>
                        )}
                        {breakdown}
                    </div>
                </div>
            </div>
        </>
    );
}

const shortLabelOf = (line: SummaryPart): string =>
    line.shortLabel ?? line.label;

function Column({ line, emphasis }: { line: SummaryLine; emphasis?: boolean }) {
    return (
        <div className="min-w-0">
            <p className="text-xs text-background/70">{line.label}</p>
            <p
                className={
                    emphasis
                        ? `mt-0.5 inline-block rounded-full bg-spent-tint px-2 py-0.5 text-lg font-semibold tabular-nums ${TONE_TEXT_CLASS[line.tone]}`
                        : "mt-0.5 font-semibold tabular-nums"
                }
            >
                {formatMxn(line.amount)}
            </p>
            {line.of.map((child) => (
                <p key={child.key} className="text-[11px] text-background/70">
                    {child.label}{" "}
                    <span className="tabular-nums">
                        {formatMxn(child.amount)}
                    </span>
                </p>
            ))}
        </div>
    );
}
