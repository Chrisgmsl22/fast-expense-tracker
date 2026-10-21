import { useTranslations } from "next-intl";

import { computeFeedTotals, nonIncomeFundedRows } from "@/lib/domain/movement";
import { formatMxn } from "@/lib/format";
import {
    FundingSplit,
    type FundedExpense,
} from "@/components/money/FundingSplit";

/**
 * The dashboard stat strip — Income in / Spent (my share) / Net so
 * far / Daily average. Net is green when positive (under income), danger when
 * negative (overspent).
 */
export function StatStrip({
    income,
    spent,
    net,
    dailyAvg,
    daysLeft,
    expenses,
}: {
    income: number;
    spent: number;
    net: number;
    dailyAvg: number;
    daysLeft: number;
    /** The month's rows, for the spend the budget skipped (spec 0007 §3.1). */
    expenses: FundedExpense[];
}) {
    const t = useTranslations("dashboard.stats");
    const tc = useTranslations("common");
    // The same figure and split the rail shows, so the two cannot disagree.
    const { notFromIncome } = computeFeedTotals(expenses);
    return (
        <div>
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-4">
                <Stat label={t("incomeIn")} value={formatMxn(income)} />
                <Stat label={t("spentMyShare")} value={formatMxn(spent)} />
                <Stat
                    label={t("netSoFar")}
                    value={`${net >= 0 ? "+" : "−"}${formatMxn(Math.abs(net))}`}
                    valueClass={net >= 0 ? "text-positive" : "text-danger"}
                />
                <Stat
                    label={t("dailyAvg", { daysLeft })}
                    value={formatMxn(dailyAvg)}
                />
            </div>
            {notFromIncome.amount > 0 ? (
                <div className="mt-2 text-xs text-muted-foreground">
                    <p>
                        {t("notFromIncome", {
                            label: tc("notFromIncome"),
                            amount: formatMxn(notFromIncome.amount),
                        })}
                    </p>
                    <FundingSplit
                        fromSavings={notFromIncome.fromSavings.amount}
                        reimbursed={notFromIncome.reimbursed.amount}
                        rows={nonIncomeFundedRows(expenses)}
                        className="mt-1 text-foreground"
                    />
                </div>
            ) : null}
        </div>
    );
}

function Stat({
    label,
    value,
    valueClass,
}: {
    label: string;
    value: string;
    valueClass?: string;
}) {
    return (
        <div className="bg-card p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={`mt-1 text-lg font-semibold ${valueClass ?? ""}`}>
                {value}
            </p>
        </div>
    );
}
