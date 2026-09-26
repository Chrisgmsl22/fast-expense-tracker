import { NON_INCOME_FUNDED_LABEL } from "@/lib/domain/funding";
import type { FeedTotals } from "@/lib/domain/movement";
import { formatMxn } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Donut, type DonutSlice } from "@/components/money/Donut";
import {
    ALSO_COUNTED_ABOVE,
    otherMoneyThatLeft,
    percentLabel,
} from "@/components/money/summary-model";
import { BottomLine } from "@/components/money/BottomLine";
import {
    FundingSplit,
    type FundingRows,
} from "@/components/money/FundingSplit";
import {
    PartsCaption,
    Pot,
    PotParts,
    Row,
    Section,
} from "@/components/money/BreakdownParts";

export type MonthBreakdownProps = {
    totals: FeedTotals;
    monthLabel: string;
    partnerName: string;
    /** This month's income, for the "x% of your income" line. Omitted = no line. */
    incomeTotal?: number;
    /** The expense rows behind each half of the other-money pot. */
    fundingRows: FundingRows;
};

/**
 * Each section answers one question, and a figure that re-cuts money from another
 * section says so (`ALSO_COUNTED_ABOVE`) instead of standing beside it.
 */
export function MonthBreakdown({
    totals,
    monthLabel,
    partnerName,
    incomeTotal,
    fundingRows,
}: MonthBreakdownProps) {
    const {
        charged,
        whatIReallySpent,
        notFromIncome,
        paidToPartner,
        setAside,
    } = totals;
    // Both pots answer "how much of this money left?", so each one holds the legacy
    // transfers funded from it — otherwise they contradict the Bottom line below,
    // which counts them (spec 0007 §6a carve-out).
    const incomeThatLeft = totals.total;
    const legacyFromIncome = paidToPartner.of.fromIncome.of.fromLegacyTransfers;
    const incomeShare = incomeShareLine(incomeThatLeft, incomeTotal);
    const otherMoney = otherMoneyThatLeft(totals);
    const paidNotFromIncome = paidToPartner.of.notFromIncome.amount;
    const legacyNotFromIncome =
        paidToPartner.of.notFromIncome.of.fromLegacyTransfers;
    const herShare = charged.of.partnerShare;
    // A legacy transfer reaches no bucket, so a pot holding nothing else counts
    // for nothing — "all but the transfers" would then be a claim about $0.
    const budgeted = whatIReallySpent.amount + setAside;
    const incomeCaption =
        budgeted === 0
            ? "none of this counts toward your budget buckets"
            : legacyFromIncome > 0
              ? "all but the transfers count toward your budget buckets"
              : "counts toward your budget buckets";

    const chargeSlices = withMoney([
        {
            key: "my-income",
            label: "My income",
            amount: charged.of.myIncome,
            tone: "spent",
        },
        {
            // NOT the pot's label: this is the slice of the CHARGE that other
            // money funded, and the pot also holds rows nothing ever charged.
            key: "my-other-money",
            label: "My other money",
            amount: charged.of.myNonIncome,
            tone: "otherMoney",
        },
        {
            key: "partner-share",
            label: `${partnerName}'s share`,
            amount: herShare,
            tone: "positive",
        },
    ]);

    // Every slice here is money that reached her, so they are toned by what FUNDED
    // them. Two shades of the partner gold would be one hue apart on adjacent arcs.
    const paidSlices = withMoney([
        {
            key: "paid-from-income",
            label: "From this month's income",
            amount: paidToPartner.of.fromIncome.amount,
            tone: "spent",
        },
        {
            key: "paid-not-from-income",
            label: NON_INCOME_FUNDED_LABEL,
            amount: paidNotFromIncome,
            tone: "otherMoney",
        },
    ]);

    return (
        <div className="space-y-7">
            <Section title="Which pot it came from">
                <div className="grid gap-3 sm:grid-cols-2">
                    {/* Both pots follow the same rule: an empty one renders
                        nothing, never a $0.00 card. */}
                    {incomeThatLeft > 0 && (
                        <Pot
                            tone="spent"
                            title="This month's income"
                            amount={incomeThatLeft}
                            caption={incomeCaption}
                        >
                            <PotParts
                                headline={incomeThatLeft}
                                parts={[
                                    {
                                        label: "Spent",
                                        amount: whatIReallySpent.amount,
                                    },
                                    {
                                        label: "Set aside",
                                        amount: setAside,
                                        tone: "positive",
                                    },
                                    {
                                        label: `Transfers to ${partnerName}`,
                                        amount: legacyFromIncome,
                                    },
                                ]}
                            />
                            {incomeShare && (
                                <p className="pt-1 text-xs text-muted-foreground">
                                    {incomeShare}
                                </p>
                            )}
                        </Pot>
                    )}
                    {otherMoney > 0 && (
                        <Pot
                            tone="otherMoney"
                            title={NON_INCOME_FUNDED_LABEL}
                            amount={otherMoney}
                            caption="outside the budget"
                        >
                            {/* One row for her, not two near-synonyms: which
                                table a payment sits in is not a distinction the
                                reader has (spec 0007 §6a carve-out). */}
                            <PotParts
                                headline={otherMoney}
                                caption="By who it went to"
                                parts={[
                                    {
                                        label: "Own spending",
                                        amount: notFromIncome.of.ownSpending,
                                    },
                                    {
                                        label: `Paid to ${partnerName}`,
                                        amount: paidNotFromIncome,
                                    },
                                ]}
                            />
                            {/* The same pot cut a second way. "From savings" is
                                the same figure as on every other surface, so the
                                legacy transfers (savings-only: a transfer cannot
                                be reimbursed) get a row of their own. */}
                            <div className="mt-3 border-t border-dashed pt-3">
                                <PartsCaption>By which money paid</PartsCaption>
                                <FundingSplit
                                    fromSavings={
                                        notFromIncome.fromSavings.amount
                                    }
                                    reimbursed={notFromIncome.reimbursed.amount}
                                    rows={fundingRows}
                                />
                                {legacyNotFromIncome > 0 && (
                                    <div className="flex min-h-6 items-center gap-1.5 py-1 text-xs">
                                        <span
                                            aria-hidden
                                            className="size-3 shrink-0"
                                        />
                                        <span>
                                            Transfers to {partnerName} (from
                                            savings)
                                        </span>
                                        <span className="ml-auto font-medium tabular-nums">
                                            {formatMxn(legacyNotFromIncome)}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </Pot>
                    )}
                </div>
                {incomeTotal !== undefined &&
                    (incomeTotal > 0 || incomeThatLeft > 0) && (
                        <IncomeRemainder
                            incomeTotal={incomeTotal}
                            incomeThatLeft={incomeThatLeft}
                        />
                    )}
            </Section>

            {charged.amount > 0 && (
                <Section title="What I was charged">
                    <div className="rounded-xl border p-4">
                        <Donut
                            slices={chargeSlices}
                            total={charged.amount}
                            centerCaption="charged"
                        />
                        {whatIReallySpent.amount > 0 && (
                            <div className="mt-4 flex items-center gap-3 border-t border-dashed pt-3">
                                <span className="text-sm font-medium">
                                    What I really spent
                                </span>
                                <span className="ml-auto text-lg font-semibold text-spent tabular-nums">
                                    {formatMxn(whatIReallySpent.amount)}
                                </span>
                            </div>
                        )}
                    </div>
                </Section>
            )}

            {totals.partnerPaidYou > 0 && (
                <Section
                    title={`${partnerName} — cash she sent you, this month`}
                >
                    <div className="rounded-xl border p-4">
                        <Row
                            label={`${partnerName} paid you`}
                            amount={totals.partnerPaidYou}
                            tone="positive"
                        />
                        <p className="pt-2 text-xs text-muted-foreground">
                            What either of you still owes belongs to the
                            settlement, not to a month.
                        </p>
                    </div>
                </Section>
            )}

            {paidToPartner.amount > 0 && (
                <Section title={`${partnerName} — what I paid her`}>
                    <div className="rounded-xl border p-4">
                        <Donut
                            slices={paidSlices}
                            total={paidToPartner.amount}
                            centerCaption="I paid her"
                        />
                        {/* Ungated: every peso in this donut is already inside a
                            pot above, whichever table it is stored in. */}
                        <p className="mt-3 border-t border-dashed pt-3 text-xs text-muted-foreground">
                            {ALSO_COUNTED_ABOVE}
                        </p>
                    </div>
                </Section>
            )}

            {/* A month where none of this month's income moved has no bottom
                line to draw — every figure in it would be $0.00. */}
            {totals.total > 0 && (
                <BottomLine totals={totals} partnerName={partnerName} />
            )}
            <p className="text-xs text-muted-foreground">
                Every figure covers {monthLabel}.
            </p>
        </div>
    );
}

function incomeShareLine(
    spent: number,
    incomeTotal: number | undefined,
): string | null {
    if (incomeTotal === undefined) return null;
    // The income figure itself lives in `IncomeRemainder`, right below this
    // pot in the same section — repeating it here read as two facts about
    // one number.
    const percent = percentLabel(spent, incomeTotal);
    return percent === null ? null : `${percent} of your income`;
}

function IncomeRemainder({
    incomeTotal,
    incomeThatLeft,
}: {
    incomeTotal: number;
    incomeThatLeft: number;
}) {
    // Compared in cents: a float sum landing a hair below zero (e.g. -1e-13)
    // must read as exactly spent, never as a red "over income" that is not real.
    const remainderCents = Math.round((incomeTotal - incomeThatLeft) * 100);
    const over = remainderCents < 0;
    const remainder = remainderCents / 100;
    return (
        <p className="mt-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-xl border px-4 py-3 text-sm">
            <span className="text-muted-foreground">
                Income{" "}
                <span className="font-medium text-foreground tabular-nums">
                    {formatMxn(incomeTotal)}
                </span>
            </span>
            <span
                className={cn(
                    "font-semibold tabular-nums",
                    over ? "text-danger" : "text-positive",
                )}
            >
                {formatMxn(Math.abs(remainder))} {over ? "over income" : "left"}
            </span>
        </p>
    );
}

/** A zero slice is dropped: an empty pot is not a $0.00 legend row. */
function withMoney(slices: DonutSlice[]): DonutSlice[] {
    return slices.filter((slice) => slice.amount > 0);
}
