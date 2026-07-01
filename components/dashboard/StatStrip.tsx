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
}: {
    income: number;
    spent: number;
    net: number;
    dailyAvg: number;
    daysLeft: number;
}) {
    return (
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
