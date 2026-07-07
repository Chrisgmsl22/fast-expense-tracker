import type {
    CoupleBalance,
    SettlementBreakdownKey,
} from "@/lib/domain/settlement";
import { formatMxn } from "@/lib/format";
import { PARTNER_NAME } from "@/lib/partner";
import { balanceTone } from "./balance-display";

const LABELS: Record<SettlementBreakdownKey, string> = {
    partner_share: `${PARTNER_NAME}'s 32% of shared expenses you logged`,
    your_debt: `Debts you logged as "I owe ${PARTNER_NAME}"`,
    partner_paid: `Money ${PARTNER_NAME} paid you`,
    you_paid: `Money you paid ${PARTNER_NAME}`,
};

const SUBLABELS: Partial<Record<SettlementBreakdownKey, string>> = {
    partner_paid: "transfers · her-funded card payments",
};

const AMOUNT_CLASS: Record<SettlementBreakdownKey, string> = {
    partner_share: "text-positive",
    your_debt: "text-transfer",
    partner_paid: "text-payment",
    you_paid: "text-payment",
};

/** "How this balance is made" — the four signed lines + the net (spec 0004 §3.1). */
export function SettlementBreakdown({ balance }: { balance: CoupleBalance }) {
    const tone = balanceTone(balance.direction);
    const netLabel =
        balance.direction === "settled"
            ? "Settled"
            : `${tone.chipLabel} ${formatMxn(balance.amount)}`;

    return (
        <div className="rounded-xl border p-5">
            <p className="font-semibold">How this balance is made</p>
            <ul className="mt-3 space-y-2 text-sm">
                {balance.breakdown.map((line) => (
                    <li
                        key={line.key}
                        className="flex items-center justify-between gap-3"
                    >
                        <span>
                            {LABELS[line.key]}
                            {SUBLABELS[line.key] ? (
                                <span className="text-muted-foreground">
                                    {" "}
                                    ({SUBLABELS[line.key]})
                                </span>
                            ) : null}
                        </span>
                        <span
                            className={`shrink-0 font-semibold tabular-nums ${AMOUNT_CLASS[line.key]}`}
                        >
                            {line.sign === "-" ? "−" : "+"}
                            {formatMxn(line.amount)}
                        </span>
                    </li>
                ))}
            </ul>
            <div className="mt-3 flex items-center justify-between border-t pt-3 text-sm">
                <span className="font-medium">Net balance</span>
                <span className={`font-bold tabular-nums ${tone.textClass}`}>
                    {netLabel}
                </span>
            </div>
        </div>
    );
}
