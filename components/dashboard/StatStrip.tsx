import {
    NON_INCOME_FUNDED_HINT,
    NON_INCOME_FUNDED_LABEL,
} from "@/lib/domain/funding";
import { formatMxn } from "@/lib/format";

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
    nonIncomeFunded,
}: {
    income: number;
    spent: number;
    net: number;
    dailyAvg: number;
    daysLeft: number;
    /**
     * My-share spend the budget skipped because this month's income didn't fund
     * it (spec 0007 §3.1). One line, shown only when there is something to say.
     */
    nonIncomeFunded: number;
}) {
    return (
        <div>
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-4">
                <Stat label="Income in" value={formatMxn(income)} />
                <Stat label="Spent (my share)" value={formatMxn(spent)} />
                <Stat
                    label="Net so far"
                    value={`${net >= 0 ? "+" : "−"}${formatMxn(Math.abs(net))}`}
                    valueClass={net >= 0 ? "text-positive" : "text-danger"}
                />
                <Stat
                    label={`Daily avg · ${daysLeft} left`}
                    value={formatMxn(dailyAvg)}
                />
            </div>
            {nonIncomeFunded > 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">
                    {`${NON_INCOME_FUNDED_LABEL}: ${formatMxn(nonIncomeFunded)} — ${NON_INCOME_FUNDED_HINT}.`}
                </p>
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
