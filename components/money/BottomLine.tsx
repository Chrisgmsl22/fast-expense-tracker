import type { FeedTotals } from "@/lib/domain/movement";
import { formatMxn } from "@/lib/format";
import { Heading, Row } from "@/components/money/BreakdownParts";
import { closingTotal } from "@/components/money/summary-model";

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
    const closing = closingTotal(totals);
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
                Out of this month&apos;s income
            </p>
            <div className="mt-2 space-y-1.5">
                {whatIReallySpent.of.spentOnMyself > 0 && (
                    <Row
                        label="Spent on myself"
                        amount={whatIReallySpent.of.spentOnMyself}
                    />
                )}
                {paidToPartner.of.fromIncome.amount > 0 && (
                    <Row
                        label={`Sent to ${partnerName}`}
                        amount={paidToPartner.of.fromIncome.amount}
                        tone="partner"
                    />
                )}
                {setAside > 0 && (
                    <Row label="Set aside" amount={setAside} tone="savings" />
                )}
            </div>
            {/* Only when it differs from the figure at the top of this block.
                It is NOT all money out: savings-funded spend is not in it. */}
            {closing !== null && (
                <div className="mt-3 flex items-center gap-3 border-t pt-3">
                    <span className="text-sm font-medium">
                        Total{" "}
                        <span className="font-normal text-muted-foreground">
                            — out of this month&apos;s income
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
