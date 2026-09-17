import { ChevronRight } from "lucide-react";

import type { CoupleBalance } from "@/lib/domain/settlement";
import type { FeedTotals } from "@/lib/domain/movement";
import { formatMxn } from "@/lib/format";
import { SettlementReminder } from "@/components/money/SettlementReminder";
import { MonthBreakdownDialog } from "@/components/money/MonthBreakdownDialog";
import {
    TONE_TEXT_CLASS,
    closingTotal,
    summaryLines,
    type SummaryLine,
} from "@/components/money/summary-model";

/**
 * The dashboard rail's summary chin: the month's figures as a hierarchy, closed by
 * the total and a way into the full breakdown.
 */
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
    /** Solo mode hides the settlement chip only — history keeps its partner figures. */
    sharesExpenses: boolean;
    /** False while browsing another month — the chip then names its own scope. */
    isCurrentMonth: boolean;
    incomeTotal?: number;
}) {
    const lines = summaryLines(totals, partnerName);
    const total = closingTotal(totals);

    return (
        <div
            data-testid="feed-totals"
            className="space-y-1.5 border-t p-4 text-sm"
        >
            <SettlementReminder
                settlement={settlement}
                partnerName={partnerName}
                sharesExpenses={sharesExpenses}
                isCurrentMonth={isCurrentMonth}
                monthLabel={monthLabel}
                className="pb-1"
            />

            {lines.map((line) => (
                <RailLine key={line.key} line={line} />
            ))}

            {total !== null && (
                <div className="-mx-4 mt-1 flex items-center justify-between bg-foreground px-4 py-2.5 text-background">
                    <span className="font-medium">Total</span>
                    <span className="px-2 font-semibold tabular-nums">
                        {formatMxn(total)}
                    </span>
                </div>
            )}

            <MonthBreakdownDialog
                totals={totals}
                monthLabel={monthLabel}
                partnerName={partnerName}
                incomeTotal={incomeTotal}
                triggerClassName="-mx-4 -mb-4 flex w-[calc(100%+2rem)] items-center gap-2 rounded-b-lg border-t px-4 py-2.5 text-xs text-muted-foreground transition-colors hover:bg-muted"
                trigger={
                    <>
                        See full breakdown
                        <ChevronRight aria-hidden className="ml-auto size-4" />
                    </>
                }
            />
        </div>
    );
}

function RailLine({ line }: { line: SummaryLine }) {
    return (
        // The testid is the seam a nesting test asserts on: a child that escaped
        // to the top level would leave this container (BUG-5).
        <div data-testid={`summary-line-${line.key}`}>
            <div className="flex items-center justify-between">
                <span
                    className={
                        line.tone === "plain"
                            ? "font-medium text-foreground"
                            : "font-medium"
                    }
                >
                    {line.label}
                </span>
                <span
                    className={`px-2 font-semibold tabular-nums ${TONE_TEXT_CLASS[line.tone]}`}
                >
                    {formatMxn(line.amount)}
                </span>
            </div>
            {line.of.length > 0 && (
                <div className="mt-1 ml-3 space-y-1 border-l pl-3">
                    {line.of.map((child) => (
                        <div
                            key={child.key}
                            className="flex items-center justify-between text-xs text-muted-foreground"
                        >
                            <span>{child.label}</span>
                            <span className="px-2 tabular-nums">
                                {formatMxn(child.amount)}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
