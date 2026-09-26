import type { FeedTotals } from "@/lib/domain/movement";
import { formatMxn } from "@/lib/format";
import { Heading, Row } from "@/components/money/BreakdownParts";
import {
    TOTAL_LABEL,
    TOTAL_QUALIFIER,
    closingTotal,
    type MoneyTone,
} from "@/components/money/summary-model";

/**
 * The month in two figures that do not overlap: what stayed with me, and what went
 * to the partner. `paidToPartner` is NOT disjoint from `whatIReallySpent` — the
 * payment-expenses sit inside it — so the total is built from `spentOnMyself`.
 */
export function BottomLine({
    totals,
    partnerName,
}: {
    totals: FeedTotals;
    partnerName: string;
}) {
    const { whatIReallySpent, paidToPartner, setAside } = totals;
    const rows: {
        label: string;
        amount: number;
        tone?: MoneyTone;
        note?: string;
    }[] = [
        { label: "Spent on myself", amount: whatIReallySpent.of.spentOnMyself },
        {
            label: `Sent to ${partnerName}`,
            amount: paidToPartner.of.fromIncome.amount,
            tone: "partner",
        },
        {
            label: "Set aside",
            amount: setAside,
            tone: "positive",
            note: "kept, not spent",
        },
    ];
    const income = rows.filter((row) => row.amount > 0);
    // The same rule `PotParts` applies: a total over a single row restates it.
    const closing = income.length > 1 ? closingTotal(totals) : null;
    return (
        <section className="rounded-xl bg-muted p-4">
            <Heading>Bottom line</Heading>
            {/* One rule for this whole block: a headline or a part with nothing
                in it is not a figure, so it is not drawn. */}
            {whatIReallySpent.amount > 0 && (
                <div className="mt-3 flex items-center gap-3">
                    <span className="text-sm font-medium">
                        What I really spent
                    </span>
                    <span className="ml-auto text-xl font-semibold text-spent tabular-nums">
                        {formatMxn(whatIReallySpent.amount)}
                    </span>
                </div>
            )}
            {whatIReallySpent.of.sentToPartner > 0 && (
                <div className="mt-1 ml-3 border-l pl-3">
                    <Row
                        label={`of which sent to ${partnerName}`}
                        amount={whatIReallySpent.of.sentToPartner}
                    />
                </div>
            )}

            <p className="mt-4 border-t pt-3 text-xs font-semibold uppercase">
                Where this month&apos;s income went
            </p>
            <div className="mt-2 space-y-1.5">
                {income.map((row) => (
                    <Row
                        key={row.label}
                        label={row.label}
                        amount={row.amount}
                        tone={row.tone}
                        note={row.note}
                    />
                ))}
            </div>
            {/* Never a restatement: neither of the figure at the top of this
                block, nor of a lone row above it. It is also NOT all money out —
                savings-funded spend is not in it. */}
            {closing !== null && (
                <div className="mt-3 flex items-center gap-3 border-t pt-3">
                    <span className="text-sm font-medium">
                        {TOTAL_LABEL}{" "}
                        <span className="font-normal text-muted-foreground">
                            {TOTAL_QUALIFIER}
                        </span>
                    </span>
                    <span className="ml-auto text-xl font-semibold tabular-nums">
                        {formatMxn(closing)}
                    </span>
                </div>
            )}
        </section>
    );
}
