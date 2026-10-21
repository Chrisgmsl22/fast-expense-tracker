import { ChevronRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import type { FeedTotalExpense, NonIncomeSource } from "@/lib/domain/movement";
import { formatExpenseDate, formatMxn } from "@/lib/format";
import { cn } from "@/lib/utils";
import { paymentTitle } from "@/components/movement/movement-display";

export type FundingRow = {
    id: string;
    description: string;
    date: Date;
    actualExpenditure: number;
};

export type FundingRows = Record<NonIncomeSource, FundingRow[]>;

/** An expense the totals can count and the split can list. */
export type FundedExpense = FeedTotalExpense & FundingRow;

type PartProps = {
    source: NonIncomeSource;
    amount: number;
    rows: FundingRow[];
    /** A partner payment's auto-label names her, so the row needs the name. */
    partnerName: string;
    className?: string;
};

/**
 * One half of "not from this month's income", opening onto the rows behind it.
 * Native `<details>`, so it works in a server component and starts closed. A
 * zero part is not drawn.
 */
export function FundingPart({
    source,
    amount,
    rows,
    partnerName,
    className,
}: PartProps) {
    const t = useTranslations("money.funding");
    const tm = useTranslations("movements");
    const locale = useLocale();
    if (amount <= 0) return null;
    const label = t(source);
    const note = source === "reimbursed" ? t("reimbursedNote") : null;
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
                aria-label={t("expensesList", { label })}
                className="mt-1 ml-1.5 space-y-1 border-l pl-3 text-muted-foreground"
            >
                {rows.map((row) => (
                    <li key={row.id} className="flex items-baseline gap-2">
                        <span className="min-w-0 flex-1 truncate text-foreground">
                            {paymentTitle(row.description, partnerName, tm)}
                        </span>
                        <span className="shrink-0">
                            {formatExpenseDate(row.date, locale)}
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
    partnerName: string;
    className?: string;
};

/** Both halves of "not from this month's income", savings first. */
export function FundingSplit({
    fromSavings,
    reimbursed,
    rows,
    partnerName,
    className,
}: Props) {
    if (fromSavings <= 0 && reimbursed <= 0) return null;
    return (
        <div className={cn("space-y-0.5", className)}>
            <FundingPart
                source="fromSavings"
                amount={fromSavings}
                rows={rows.fromSavings}
                partnerName={partnerName}
            />
            <FundingPart
                source="reimbursed"
                amount={reimbursed}
                rows={rows.reimbursed}
                partnerName={partnerName}
            />
        </div>
    );
}
