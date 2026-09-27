import { ChevronRight } from "lucide-react";

import {
    FROM_SAVINGS_LABEL,
    REIMBURSED_LABEL,
    REIMBURSED_NOTE,
} from "@/lib/domain/funding";
import type { FeedTotalExpense, NonIncomeSource } from "@/lib/domain/movement";
import { formatExpenseDate, formatMxn } from "@/lib/format";
import { cn } from "@/lib/utils";

export type FundingRow = {
    id: string;
    description: string;
    date: Date;
    actualExpenditure: number;
};

export type FundingRows = Record<NonIncomeSource, FundingRow[]>;

/** An expense the totals can count and the split can list. */
export type FundedExpense = FeedTotalExpense & FundingRow;

const PART_COPY: Record<
    NonIncomeSource,
    { label: string; note: string | null }
> = {
    fromSavings: { label: FROM_SAVINGS_LABEL, note: null },
    reimbursed: { label: REIMBURSED_LABEL, note: REIMBURSED_NOTE },
};

type PartProps = {
    source: NonIncomeSource;
    amount: number;
    rows: FundingRow[];
    className?: string;
};

/**
 * One half of "not from this month's income", opening onto the rows behind it.
 * Native `<details>`, so it works in a server component and starts closed. A
 * zero part is not drawn.
 */
export function FundingPart({ source, amount, rows, className }: PartProps) {
    if (amount <= 0) return null;
    const { label, note } = PART_COPY[source];
    return (
        <details className={cn("group text-xs", className)}>
            <summary className="flex min-h-6 cursor-pointer list-none items-center gap-1.5 rounded-sm py-1 focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
                <ChevronRight
                    aria-hidden
                    className="size-3 shrink-0 text-muted-foreground transition-transform group-open:rotate-90 motion-reduce:transition-none"
                />
                <span>{label}</span>
                {note && <span className="text-muted-foreground">{note}</span>}
                <span
                    className={cn(
                        "ml-auto font-medium tabular-nums",
                        note && "text-muted-foreground",
                    )}
                >
                    {formatMxn(amount)}
                </span>
            </summary>
            <ul
                aria-label={`${label} expenses`}
                className="mt-1 ml-1.5 space-y-1 border-l pl-3 text-muted-foreground"
            >
                {rows.map((row) => (
                    <li key={row.id} className="flex items-baseline gap-2">
                        <span className="min-w-0 flex-1 truncate text-foreground">
                            {row.description}
                        </span>
                        <span className="shrink-0">
                            {formatExpenseDate(row.date)}
                        </span>
                        <span className="shrink-0 tabular-nums">
                            {formatMxn(row.actualExpenditure)}
                        </span>
                    </li>
                ))}
            </ul>
        </details>
    );
}

type Props = {
    fromSavings: number;
    reimbursed: number;
    rows: FundingRows;
    className?: string;
};

/** Both halves of "not from this month's income", savings first. */
export function FundingSplit({
    fromSavings,
    reimbursed,
    rows,
    className,
}: Props) {
    if (fromSavings <= 0 && reimbursed <= 0) return null;
    return (
        <div className={cn("space-y-0.5", className)}>
            <FundingPart
                source="fromSavings"
                amount={fromSavings}
                rows={rows.fromSavings}
            />
            <FundingPart
                source="reimbursed"
                amount={reimbursed}
                rows={rows.reimbursed}
            />
        </div>
    );
}
