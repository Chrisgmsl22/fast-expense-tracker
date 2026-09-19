import { ChevronRight } from "lucide-react";

import type {
    CoupleBalance,
    SettlementBreakdownKey,
} from "@/lib/domain/settlement";
import { formatExpenseDate, formatMxn } from "@/lib/format";
import type {
    SettlementBreakdownItem,
    SettlementBreakdownItems,
} from "@/lib/services/settlement/settlement.service";
import {
    Collapsible,
    CollapsiblePanel,
    CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { balanceTone } from "./balance-display";

const labelsFor = (
    partnerName: string,
): Record<SettlementBreakdownKey, string> => ({
    partner_share: `${partnerName}'s 32% of shared expenses you logged`,
    partner_debt: `Debts you logged as "${partnerName} owes me"`,
    your_debt: `Debts you logged as "I owe ${partnerName}"`,
    partner_paid: `Money ${partnerName} paid you`,
    you_paid: `Money you paid ${partnerName}`,
});

const SUBLABELS: Partial<Record<SettlementBreakdownKey, string>> = {
    partner_paid: "transfers she sent you",
};

// Money lines carry the journal's colour language: green = she paid you,
// gold = you paid her, orange = a debt you owe (matches the journal key).
const AMOUNT_CLASS: Record<SettlementBreakdownKey, string> = {
    partner_share: "text-positive",
    partner_debt: "text-positive",
    your_debt: "text-debt",
    partner_paid: "text-positive",
    you_paid: "text-transfer",
};

/** Sub-cent slack — the epsilon `isBalanceSettled` uses for Float drift. */
const isZeroCents = (n: number): boolean => Math.abs(n) < 0.005;

/**
 * "How this balance is made" — the five signed lines + the net (spec 0007).
 * Each line opens to the rows behind it; collapsed by default.
 */
export function SettlementBreakdown({
    balance,
    breakdownItems,
    partnerName,
}: {
    balance: CoupleBalance;
    /** The rows behind each line, from `getSettlement`. */
    breakdownItems: SettlementBreakdownItems;
    partnerName: string;
}) {
    const tone = balanceTone(balance.direction, partnerName);
    const labels = labelsFor(partnerName);
    const netLabel =
        balance.direction === "settled"
            ? "Settled"
            : `${tone.chipLabel} ${formatMxn(balance.amount)}`;

    return (
        <div className="rounded-xl border p-5">
            <p className="font-semibold">How this balance is made</p>
            <ul className="mt-3 space-y-1 text-sm">
                {balance.breakdown.map((line) => {
                    const items = breakdownItems[line.key];
                    const label = (
                        <>
                            {labels[line.key]}
                            {SUBLABELS[line.key] ? (
                                <span className="text-muted-foreground">
                                    {" "}
                                    ({SUBLABELS[line.key]})
                                </span>
                            ) : null}
                        </>
                    );
                    const total = (
                        <span
                            className={`shrink-0 font-semibold tabular-nums ${AMOUNT_CLASS[line.key]}`}
                        >
                            {/* Nothing moved in this direction, so the line
                                carries no sign — "−$0.00" reads as a debit. */}
                            {isZeroCents(line.amount)
                                ? ""
                                : line.sign === "-"
                                  ? "−"
                                  : "+"}
                            {formatMxn(line.amount)}
                        </span>
                    );

                    return (
                        <li key={line.key}>
                            {items.length === 0 ? (
                                // Nothing to open — say so inline rather than offer an empty region. A line with
                                // no rows but a non-zero total is a real inconsistency, so it says that instead.
                                <div className="flex items-center justify-between gap-3 py-1 pl-5">
                                    <span>
                                        {label}
                                        <span className="text-muted-foreground">
                                            {" "}
                                            {isZeroCents(line.amount)
                                                ? "— nothing this window"
                                                : "— no itemized rows"}
                                        </span>
                                    </span>
                                    {total}
                                </div>
                            ) : (
                                <Collapsible>
                                    <CollapsibleTrigger
                                        aria-controls={`breakdown-${line.key}`}
                                        className="group flex w-full items-center justify-between gap-3 py-1 text-left hover:bg-muted/50"
                                    >
                                        <span className="flex min-w-0 items-start gap-1.5">
                                            <ChevronRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground transition-transform group-aria-expanded:rotate-90" />
                                            <span>{label}</span>
                                        </span>
                                        {total}
                                    </CollapsibleTrigger>
                                    {/* Kept mounted (and `hidden` while closed,
                                        so it stays out of the a11y tree) purely
                                        so the trigger's `aria-controls` always
                                        points at a real element — Base UI drops
                                        the attribute when the panel unmounts. */}
                                    <CollapsiblePanel
                                        id={`breakdown-${line.key}`}
                                        keepMounted
                                    >
                                        <ul className="mt-1 mb-2 ml-5 space-y-1.5 border-l pl-3">
                                            {items.map((item) => (
                                                <BreakdownItemRow
                                                    key={item.id}
                                                    item={item}
                                                    sign={line.sign}
                                                    amountClass={
                                                        AMOUNT_CLASS[line.key]
                                                    }
                                                    partnerName={partnerName}
                                                />
                                            ))}
                                        </ul>
                                    </CollapsiblePanel>
                                </Collapsible>
                            )}
                        </li>
                    );
                })}
            </ul>
            {/* Net balance as a dark band flush to the card edges — the same
                high-contrast treatment as the expenses totals bar, so the
                bottom line is the easiest thing to spot. */}
            <div className="-mx-5 -mb-5 mt-4 flex items-center justify-between rounded-b-xl bg-foreground px-5 py-3 text-sm text-background">
                <span className="font-medium">Net balance</span>
                <span className="font-bold tabular-nums">{netLabel}</span>
            </div>
        </div>
    );
}

/**
 * One revealed row. A partner-share row also names the full expense it came out of,
 * labelled so the two figures can't be read as one.
 */
function BreakdownItemRow({
    item,
    sign,
    amountClass,
    partnerName,
}: {
    item: SettlementBreakdownItem;
    sign: "+" | "-";
    amountClass: string;
    partnerName: string;
}) {
    const subtitle =
        item.gross === null
            ? formatExpenseDate(item.date)
            : `${formatExpenseDate(item.date)} · ${partnerName}'s share of ${formatMxn(item.gross)} you paid`;

    return (
        <li className="flex items-start justify-between gap-3">
            <span className="min-w-0">
                <span className="block truncate text-xs font-medium">
                    {item.description}
                </span>
                <span className="block text-xs text-muted-foreground">
                    {subtitle}
                </span>
            </span>
            <span className={`shrink-0 text-xs tabular-nums ${amountClass}`}>
                {sign === "-" ? "−" : "+"}
                {formatMxn(item.amount)}
            </span>
        </li>
    );
}
